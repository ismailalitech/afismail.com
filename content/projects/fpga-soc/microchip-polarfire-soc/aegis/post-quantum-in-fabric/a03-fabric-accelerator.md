+++
title = "A Keccak and NTT accelerator that is correct and not faster"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "Build a hash and transform engine for ML-KEM and ML-DSA in the FPGA, prove it against the NIST vectors with every Keccak permutation done in hardware, and measure why it adds time instead of saving it."
weight = 10

[params]
  lab = 49
  board = "PolarFire SoC Discovery Kit"
  core = "FPGA fabric and U54 (Linux)"
  level = "Advanced"
+++

After this lab you can build the accelerator, run its simulation, check a post-quantum library against the NIST vectors with the
fabric doing every hash permutation, and read a measurement that shows the accelerator costing time. The negative result is
the point: it tells you where the time goes and what to change.

## Before you start

- **Level 3.** Know what a Keccak permutation and the number-theoretic transform (NTT) are for in ML-KEM and ML-DSA: the
  first is the hash inside both, the second is the polynomial multiplication.
- A PolarFire SoC Discovery Kit running the pfdaq fabric (this accelerator is added to it), Libero SoC 2026.1, and the Aegis
  repository checked out next to the pfdaq repository.
- Icarus Verilog for the simulation.

## The idea

ML-KEM and ML-DSA spend most of their time in two kernels. SHAKE and SHA-3 (Keccak-f[1600]) generate and expand random-looking
data; the NTT multiplies polynomials. Both are good candidates for hardware. The fabric block has:

- **Keccak-f[1600]**, one round per clock, so one permutation takes 24 cycles.
- **One NTT unit** for the ML-KEM (FIPS 203) and ML-DSA (FIPS 204) transforms, one butterfly per clock, with Barrett reduction
  proven correct over every input in a model.

The block sits on the same APB bus as the rest of the project's registers, in slot 14 (0x40000E00), and Linux drives it
through a small kernel interface and a user-space page.

## Run it

### 1. Simulate

```sh
hw/tb/run_all.sh --fast
```

It runs the Python models' own self-tests, checks that the ROM is current, generates vectors, then runs the RTL unit test and the
APB system test in Icarus Verilog. About 49 seconds with `--fast`. The testbenches only record; the Python models judge. The last
run made 380,925 APB transfers and 114,294 checks with 0 errors.

One permutation, taken from that simulation (`hw/tb/make_wave.sh` rebuilds the figure from a fresh run): the CPU loads the state,
writes 1 to the control register, and the busy signal stays high for exactly 24 clocks, 480 ns.

![Waveform from the RTL simulation: the CPU writes the state words and a 1 to CTRL; k_busy then stays high for 480 ns, 24 clocks, while STATUS is polled; k_done goes high as the permutation ends](/aegis/diagrams/sim-keccak-permutation.svg)

### 2. Build and program

```sh
PFDAQ_ROOT=<pfdaq checkout> hw/libero/build.sh 101
```

The script builds the pfdaq fabric with the accelerator added and writes a programming job that contains the fabric and sNVM
only, never the boot flash, keys or security settings. Timing met in every corner, with 2.06 ns worst slack on the 50 MHz bus
domain. The whole design uses 36,373 logic elements (38.9 %); the accelerator adds about 11,844 4-input LUTs, 3,087
flip-flops, 2 RAM blocks and 26 math blocks. Program it with FlashPro Express as in the pfdaq lab, and read the design version
back: it should be `0x65`.

What Libero shows for this build, from a copy of the finished project (nothing was run or changed):

The design hierarchy: `aegis_pqc` is a user block next to the vendor's, built from `aegis_keccak` (with its round function)
and `aegis_ntt` (with the modular multiplier, the twiddle ROM and a dual-port RAM).

![The Libero design hierarchy with callouts: aegis_pqc, its Keccak and NTT blocks, and the vendor blocks beside them](/aegis/diagrams/libero-hierarchy-annotated.svg)

The top-level canvas. The accelerator is the small block in the lower middle; the large blocks are the vendor's peripherals and
the processor subsystem.

[![The whole top-level SmartDesign canvas of MPFS_DISCOVERY_KIT in Libero SoC](/aegis/libero/libero-aegis-top-canvas.png)](/aegis/libero/libero-aegis-top-canvas.png)

Zoomed on the accelerator and its neighbours:

![The zoomed canvas with numbered callouts on aegis_pqc_0, FIC_3_PERIPHERALS_0, FIC_0_PERIPHERALS_0 and MSS_WRAPPER_0](/aegis/diagrams/libero-canvas-annotated.svg)

The resource report after compiling the netlist. The whole design, including the pfdaq blocks and the vendor's peripherals,
uses 34,551 of 93,516 four-input LUTs (36.95 %), 17,151 flip-flops (18.34 %), 31 large RAM blocks (10.06 %) and 44 math blocks
(15.07 %). The logic-element figure quoted above, 36,373 (38.9 %), is the later place-and-route count, which packs LUTs and
flip-flops together.

[![The Libero compile report Resource Usage table: 4LUT 34551 of 93516, DFF 17151 of 93516, uSRAM 49 of 876, LSRAM 31 of 308, Math 44 of 292](/aegis/libero/libero-aegis-resource-usage.png)](/aegis/libero/libero-aegis-resource-usage.png)

The timing summary, maximum delay across all corners. The 125 MHz domain closes with 1.021 ns of slack and the 50 MHz domain,
the one the accelerator is clocked from, with 2.056 ns.

[![The Libero multi-corner maximum-delay timing summary: 1.021 ns worst slack at 125 MHz and 2.056 ns at 50 MHz, both in the slow_lv_ht corner](/aegis/libero/libero-aegis-timing-summary.png)](/aegis/libero/libero-aegis-timing-summary.png)

### 3. Self-test on the board

`pqc_selftest 500` compares the fabric's Keccak and both NTTs against C references on 500 random inputs each:

| Check | Result |
|---|---|
| Keccak against the C reference, and the all-zero known answer | 0 mismatches |
| ML-KEM NTT and inverse NTT against the reference | 0 mismatches in 500 each |
| ML-DSA NTT and inverse NTT against the reference | 0 mismatches in 500 each |
| forward then inverse transform, entirely in hardware | 0 failures |

### 4. Run the NIST vectors with the fabric hashing

liboqs is built so that every Keccak permutation goes through the fabric when `AEGIS_PQC_KECCAK=hw`. With `check`, both the
fabric and the software run on every call and are compared.

```sh
cd /root/aegis/oqs-fabric
LD_LIBRARY_PATH=$PWD AEGIS_PQC_KECCAK=hw python3 run_acvp_commands.py commands.jsonl $PWD
```

The commands are the exact command lines liboqs' own ACVP test would run, recorded from the unchanged test file against the
checksummed NIST files (ACVP-Server v1.1.0.41). Result: the known-answer digests for ML-KEM-768 and ML-DSA-65 equal the
reference, and in `check` mode 4,657,147 permutations compared with 0 differences.

## Why it is slower

The core is fast; the road to it is not. Measured on one U54 core with liboqs:

| Operation | Core time | Seen by Linux, including the bus |
|---|---|---|
| Keccak-f[1600] | 0.48 microseconds (24 cycles at 50 MHz) | 16.7 microseconds |
| ML-KEM NTT or its inverse | 18.1 microseconds | 113 microseconds |
| ML-DSA NTT or its inverse | 20.6 microseconds | 116 microseconds |

| liboqs on one U54 | Software Keccak | Fabric Keccak |
|---|---|---|
| ML-KEM-768 key generation | 1.219 ms | 1.315 ms |
| ML-KEM-768 encapsulation | 1.417 ms | 1.508 ms |
| ML-KEM-768 decapsulation | 1.755 ms | 1.870 ms |
| ML-DSA-65 key pair | 3.99 ms | 4.48 ms |
| ML-DSA-65 sign (mean) | 14.3 ms | 15.5 ms |
| ML-DSA-65 verify | 4.12 ms | 4.57 ms |

Each permutation moves 100 uncached 32-bit words across the bus, one transfer at a time. Compute is 0.48 of the 16.7
microseconds. The NTT unit is not even wired into liboqs, because moving 512 words costs more than a software NTT.

## What would make it faster

None of this is built; it follows from the numbers.

- Keep the data in the fabric across calls: a whole sponge, or a whole polynomial-matrix step, instead of one permutation.
- Move data by DMA or over the 64-bit AXI interface instead of the APB bus.
- Let the real-time core drive the block without Linux in the path.

## What to check

- The self-test reports zero mismatches, and the ACVP digests equal the reference with the fabric hashing.
- The software-versus-fabric timings differ by about 8 to 12 percent in the direction shown above.
- If the design version does not read back as `0x65`, the wrong job was programmed.

## Where it can go wrong

- Programming the job for another board. This one is built for the Discovery Kit only.
- Expecting speed. The accelerator is a correct base for a design that keeps data in the fabric; as built, it is not a
  security mechanism and not a speed-up.
- Reprogramming the fabric after the gateway is enrolled: the PC will refuse the next quote until you re-enrol, as in
  [lab 48](/projects/fpga-soc/microchip-polarfire-soc/aegis/identity-and-quotes/a02-gateway-identity-and-quote/).
