+++
title = "The 5x slowdown that was the build, not TrustZone"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "A neural network ran 2.8 to 5.4 times slower in the Secure world, until the build flags were matched. Where the time went, how to see it, and what remains."
weight = 10

[params]
  lab = 18
  board = "STM32H573I-DK and FPB-RA4E1"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Advanced"
+++

After this module you can explain why a neural network placed in the Secure world first ran 2.8 to 5.4 times slower than the same network outside it, show that the cause was the compiler flags of the Secure build and not TrustZone, find the cause in a disassembly, and compare two worlds without measuring the build system by mistake. It is the first module of the Secure AI part because every later number depends on it: a service that is five times slower than it should be makes every blocking term five times too large.

## Before you start

- **Level: Advanced.** You should know what a call into the Secure world costs ([What a Secure call costs](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/)) and why this project times things with hardware counters ([Hardware timestamps](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m01-hardware-timestamps/)).
- **Words used here.** A *builtin* is a function that the compiler is allowed to replace with inline code: `memcpy` of four bytes becomes one load instruction. *Unaligned word read* means reading four bytes from an address that is not a multiple of four. *im2col* is the step of a convolution that copies the input patches into a matrix before the multiply.
- **Tools:** nothing is needed to follow the argument. To repeat it you need a Cortex-M33 board, a CMSIS-NN build and an objdump.

## The idea

The first measurement of the service gave a result that looked like a TrustZone cost. The same network, the same source files and the same optimisation level took 14.7 ms at the smallest size in the Secure partition against 5.2 ms outside it, and the ratio grew with the size of the network to 5.4. The per-layer ratio grew too: 2.3 on the first convolution, 7.7 to 8.5 on the fully connected layer.

The object code was not the same. CMSIS-NN reads unaligned words with a pattern of this shape:

```c
memcpy(&value, pointer, 4);
```

Compiled normally, GCC knows `memcpy` and emits one `ldr`. TF-M's toolchain file adds `-fno-builtin` to every Secure object. With that flag the compiler may not assume what `memcpy` does, so the same line becomes a real call to TF-M's own C `memcpy`: a byte loop with alignment tests. The kernels that read the most unaligned words per multiply-add suffer most, and the fully connected layer is one of them.

So the slowdown is a property of how the Secure image is built. Two checks separate it from the architecture: remove the flag from the kernels and see whether the gap closes, and reproduce the effect somewhere with no TrustZone at all.

## On this board

The network is an int8 CNN with a 32 by 32 single-channel input: a 3 by 3 convolution with `F` channels and ReLU, a 2 by 2 pool, a second 3 by 3 convolution from `F` to `F` channels and ReLU, a second pool, and a fully connected layer from `64F` to 10 outputs. Three sizes are used, `F` = 4, 8 and 16. The weights are pseudo-random int8 values from a fixed seed, so the timing is that of a trained network of the same shape while the accuracy means nothing. The same model code and the same CMSIS-NN sources are compiled into the Non-Secure image and into the Secure partition (experiment `exp9ai`, STM32H573I-DK, Zephyr 4.4.99, TF-M 2.3.0 at isolation level 1, GCC 14.3.0, 240 MHz).

The fix is an opt-in build option: `-fbuiltin` is added to the ten CMSIS-NN source files and to the model code, and nothing else in the partition or in TF-M changes. In the disassembly of the Secure image, before the change the matrix-multiplication kernel of the convolutions contained 11 calls to `memcpy` and the fully connected kernel 30, and the fully connected kernel had 36 dual multiply-accumulate instructions against 84 in the Non-Secure build. After it, none of these calls remained and the counts matched.

## How it is measured

Each body is timed alone in a calibration phase, with the hardware cycle counter read in the Non-Secure world and inside the partition, so a layer has a Non-Secure time and a Secure time. The experiment was run twice on the same board: once with the stock flags (run `20261105_163212`) and once with `-fbuiltin` kernels (run `20261105_193306`). The ratios below are Secure over Non-Secure, from the minima of the calibration samples. The Non-Secure image is identical in both runs (the smallest network takes 1,242,143 cycles in one and 1,242,407 in the other).

To rule out the instruction cache, the cache's hit and miss monitors were read around one unloaded inference in each world. They are assigned to the Non-Secure side on this chip, so the read is made from there.

To rule out TrustZone altogether, the same network was built as a plain single-world image, with no Secure partition at all, on both boards, in three modes: the default build, `-fno-builtin` on the kernels and the model code, and `-fno-builtin` with TF-M's own `memcpy` linked in. A script counts the calls to `memcpy` in the disassembly of each build, and a checksum of the ten outputs must be the same in every mode and on both boards. One detail matters if you repeat this: Zephyr's default `_FORTIFY_SOURCE=1` makes the C library map `memcpy` to a builtin that GCC inlines whatever `-fno-builtin` says, so the plain image needs `CONFIG_FORTIFY_SOURCE_NONE=y` to show the effect. TF-M does not define `_FORTIFY_SOURCE`.

## What you should see

Secure over Non-Secure time, per layer and for the whole inference (experiment `exp9ai`, STM32H573I-DK):

| Layer | Before, F=4 | F=8 | F=16 | After, F=4 | F=8 | F=16 |
|---|---|---|---|---|---|---|
| conv1 | 2.31 | 2.58 | 2.86 | 1.18 | 1.14 | 1.09 |
| pool1 | 2.83 | 3.30 | 3.67 | 1.03 | 0.99 | 0.97 |
| conv2 | 4.12 | 6.13 | 8.09 | 1.06 | 0.99 | 0.97 |
| pool2 | 2.79 | 3.27 | 3.64 | 1.03 | 1.00 | 0.97 |
| FC | 7.76 | 8.24 | 8.51 | 1.04 | 1.02 | 1.01 |
| Non-Secure whole inference (ms) | 5.18 | 7.78 | 14.55 | 5.18 | 7.78 | 14.55 |
| Secure whole inference (ms) | 14.66 | 29.89 | 77.85 | 5.93 | 8.42 | 14.96 |

The whole-inference ratio goes from 2.8, 3.8 and 5.4 to 1.14, 1.08 and 1.03.

![Secure over Non-Secure time per layer for three network sizes, before and after compiling the Secure kernels with -fbuiltin. Before, the bars reach 8; after, they sit near 1.](/images/tfm/ai_parity.png)

*Per-layer Secure over Non-Secure ratio before (light) and after (solid) the change, one group per network size. The circles and squares are instruction-cache misses per inference after the change (right axis).*

The instruction cache is not the explanation. After the change the misses per inference are close in both worlds:

| | F=4 | F=8 | F=16 |
|---|---|---|---|
| Misses, Non-Secure | 246 | 247 | 318 |
| Misses, Secure | 210 | 226 | 299 |
| Hits (millions), Non-Secure | 0.86 | 1.36 | 2.71 |
| Hits (millions), Secure | 0.96 | 1.42 | 2.70 |

The effect is reproduced without TrustZone on the second board (FPB-RA4E1 at 100 MHz, plain image, same network and seeds):

| Mode | F=4 | F=8 | F=16 |
|---|---|---|---|
| Default build (ms) | 12.76 | 19.33 | 36.49 |
| `-fno-builtin` (ms) | 30.98 | 64.61 | 170.56 |
| Ratio to the default | 2.43 | 3.34 | 4.67 |
| `-fno-builtin` and TF-M `memcpy` (ms) | 37.20 | 77.55 | 205.40 |
| Ratio to the default | 2.92 | 4.01 | 5.63 |

The outputs of the ten logits have the same checksum in all three modes. The fully connected layer is the most affected, 6.2 to 6.7 times slower with `-fno-builtin` and 9.4 to 10.2 times with TF-M's `memcpy`. The call-site count tells the same story and is identical on both boards:

| Mode | `memcpy` call sites in the kernels | of which fixed-length word reads | of which in the FC kernel |
|---|---|---|---|
| Default | 13 (buffer copies and clears) | 0 | 0 |
| `-fno-builtin` | 77 | 63 | 30 |
| `-fno-builtin` and TF-M `memcpy` | 77 | 63 | 30 |

The slowdown that the TF-M build gave on the STM32 (2.8 to 5.4) is of the same size as the plain-image figure with TF-M's `memcpy` on the RA4E1 (2.9 to 5.6), on a chip that has no Secure world in this experiment.

What remains after the fix is 9 to 18 percent on the first convolution only. Its im2col step copies one byte per tap through the linked `memcpy`, and TF-M's alignment tests cost about 16 cycles more per one-byte copy than Zephyr's loop. The excess is the same 636 microseconds at all three sizes (for example 5237.4 against 4601.3 microseconds at F=8), which is why the ratio falls as the layer grows. The aligned copies of the second convolution are within 6 percent of the Non-Secure time (ratios 0.97 to 1.06).

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| A Secure workload is several times slower than the same code outside | The two images are compiled differently. Check the flags of the Secure object before looking at the architecture. |
| The plain image on your board shows no difference between modes | `_FORTIFY_SOURCE` is on and the C library inlines `memcpy` anyway. Turn it off for the test. |
| The ratio is still above 1 on one layer only | A one-byte or odd-size copy goes through the linked `memcpy`. Look at which copy sizes that layer uses. |
| The cache looks guilty | Compare the miss counts in both worlds. Here they differ by less than 15 percent. |
| The outputs differ between modes | The test is not comparing like with like. The checksums must be equal before any time is quoted. |

## Trade-offs and going further

- **A departure from the TF-M defaults.** `-fbuiltin` is applied only to the CMSIS-NN sources and the model code, which handle no key material. Moving an inference library into the Secure image also enlarges the Secure trusted code base, whatever flags it is built with.
- **Other toolchains.** The effect applies to any library that writes unaligned loads as `memcpy` and is built under TF-M's GNU toolchain file. It has not been checked with other toolchains here.
- **The last 9 to 18 percent.** A word-and-byte copy loop in CMSIS-NN's copy helper, used in both worlds, should remove it. The stock library was kept for the data.
- **Exercise:** the Non-Secure conv1 times are 3492.0, 4601.3 and 6819.9 microseconds for `F` = 4, 8 and 16. Add the constant excess of 636 microseconds and check that you get the ratios 1.18, 1.14 and 1.09 of the table. Then say what the constant excess tells you about what the im2col step depends on.
- **Exercise:** the plain image shows 2.92 to 5.63 with TF-M's `memcpy` on the RA4E1 and the Secure partition showed 2.8 to 5.4 on the STM32. List two reasons the numbers need not match exactly, and say what you would measure to test each.

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Status** | Measured on both boards; write-up in progress |
| **Read first** | [What a Secure call costs](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/) |
| **Next** | [One call or many: the granularity of a Secure call](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai02-granularity-decides-misses/) |
| **Evidence** | `exp9ai` on the STM32H573I-DK, runs `20261105_163212` (stock flags) and `20261105_193306` (`-fbuiltin` kernels); the plain-image benchmark on the STM32H573I-DK and the FPB-RA4E1 (RA4E1 logs and call-site counts) |
| **Related** | [Two boards, one method](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m02-two-boards-one-method/); [What TF-M costs over bare TrustZone-M](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c02-tfm-over-bare-trustzone/); [Cache-related preemption delay](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s04-cache-related-preemption-delay/) |
