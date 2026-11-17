+++
title = "A Keccak sponge in the fabric that is faster"
date = '2026-11-17T12:00:00+01:00'
draft = false
description = "Keep the hash state in the FPGA, squeeze whole blocks into DDR by DMA, prove it against the NIST vectors with every SHA-3 call done in hardware, and measure ML-KEM and ML-DSA 1.2 to 1.5 times faster than software."
weight = 20

[params]
  lab = 54
  board = "PolarFire SoC Discovery Kit"
  core = "FPGA fabric and U54 (Linux)"
  level = "Advanced"
+++

After this lab you can build the second version of the Aegis accelerator, check it in simulation and on a PC model, put it
into the board design, and measure it making ML-KEM and ML-DSA faster on the gateway. It follows
[lab 49](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a03-fabric-accelerator/), whose
accelerator was correct and slower: this one is designed from that lab's measurement.

## Before you start

- **Level 3.** Know what the sponge construction is: SHA-3 and SHAKE absorb input into a 1600-bit state and squeeze output
  out of it, one Keccak permutation per block.
- Lab 49 read, or at least its timing table.
- A PolarFire SoC Discovery Kit running the pfdaq fabric, Libero SoC 2026.1, Icarus Verilog, and the liboqs 0.16.0 source.
- The Aegis repository at release v0.2.0 or later, next to the pfdaq repository.

## The idea

Lab 49 measured 16.7 microseconds per Keccak permutation as Linux sees it, of which the fabric computes for 0.48. The rest
is the 32-bit bus: 50 words in and 50 out for every permutation. So the data path has to change, not the core.

Counting liboqs' permutations shows where they are. ML-DSA-65 verification does 174, and 150 of them squeeze SHAKE128 to
expand the public matrix: long squeezes from one sponge, five blocks at a time. A design that keeps the state in the
fabric and sends whole squeezed blocks to memory saves most of the traffic.

Three designs were compared with a cost model built from measured bus costs. The model first had to predict lab 49's
measured times, and did, within 4 %:

| Design | Predicted speed against software |
|---|---|
| A: one permutation per call over APB (lab 49) | 0.93 to 0.96 (measured: 0.89 to 0.96) |
| B: state kept in the fabric, APB only | 1.18 to 1.37 |
| C: B, plus full squeezed blocks written into DDR by DMA | 1.42 to 2.42 |

Design C was built.

![What crosses the bus. Lab 49: 50 words in and 50 out over APB for every permutation. Lab 54: only absorbed bytes and commands over APB; the state stays in the fabric in one of 8 slots; squeezed blocks go out as 64-bit AXI bursts into a non-cached DDR page that the CPU copies](/aegis/diagrams/accel-data-path.svg)

## What is in the block

- **The state stays in the fabric.** One Keccak round per clock, the same round function as lab 49.
- **XOR writes.** Absorbing a block is writing its words in XOR mode: no read is needed.
- **Eight slots.** A program has several hashes open at once (four for a four-way SHAKE), so the block keeps 8 states in
  block RAM. Switching slots takes 51 clocks; more contexts than slots are saved to memory by the driver.
- **Squeeze by DMA.** One command: N times, permute, then write the block as one AXI4 burst of 64-bit beats. The block
  refuses a misaligned address, a burst that would cross 4 KiB, a bad rate or zero blocks, and stops on an error response.
  It counts the blocks written, so the CPU copies block *i* while block *i+1* is computed.
- **No polling.** An access that needs the engine idle is held on the bus (PREADY low) until it is.
- **Lab 49's slot and registers.** The block takes the same bus slot and its register map adds to lab 49's, so lab 49's
  driver still works on it.

On the Linux side, a SHA-3 provider for liboqs gives each hash context a slot and installs itself when a program starts
with `AEGIS_PQC_SPONGE=hw`, so liboqs' own programs use the block unchanged.

## Run it

### 1. Simulate

```sh
hw/tb/run_all.sh --fast
```

It runs lab 49's checks, then the new block's: a Python model of the block writes a 4,500-operation script, every hash in
it also checked against Python's `hashlib`; the testbench replays it on the RTL behind an AXI memory model that holds its
ready signals low at random, returns an error in one address range, and checks the bus protocol. Result: 3,251 checks and
835 DMA beats, no difference. Five bugs planted on purpose in the RTL (a slot loaded one lane off, XOR ignored, the last
beat flagged one beat early, no 4 KiB check, an error response ignored) each make it fail.

One DMA squeeze from that simulation (`hw/tb/make_wave_dma.sh` rebuilds the figure from a fresh run): one command, 24 clocks
of permutation, then one burst of 21 beats while the memory model makes it wait.

![Waveform from the RTL simulation of aegis_pqc2 squeezing one block by DMA: one APB write of SQUEEZE, busy for 24 clocks, then AWVALID for one burst, 21 64-bit beats with WREADY held low at random, WLAST on the last beat and the write response](/aegis/diagrams/sim-sponge-dma.svg)

### 2. Check the software on the PC

```sh
tests/host/test_sponge_provider.sh
```

The provider runs against a C model of the block's registers. The model first replays the RTL's own test script with no
difference, so testing against it is testing against the RTL's behaviour. Then, 18 checks:

- liboqs' `test_sha3` (SHA3-256, -384, -512, SHAKE128, SHAKE256, four-way) passes through the provider, with 8 slots and
  with 1;
- the ML-KEM-768 and ML-DSA-65 known-answer outputs are byte-identical to plain liboqs with 8 slots, with 1 slot (every
  switch saves and restores a context), without DMA, and with the block left in another slot by a previous program;
- the 265 NIST ACVP cases pass with 8 slots and with 1;
- every program above is checked to have really used the provider. A silent fallback to liboqs' own SHA-3 passes
  everything; during development this check caught exactly that once.

### 3. Build and program

```sh
AEGIS_OVERLAY=AEGIS_PQC2.tcl PFDAQ_ROOT=<pfdaq checkout> hw/libero/build.sh 102
```

The block takes lab 49's slot on the APB bus (0x40000E00). Its AXI4 master is a second master port on the FIC0
interconnect, the one pfdaq's DMA already uses, whose other side is the processor subsystem's FIC0 target and so DDR. The
block runs on the 50 MHz bus clock; the interconnect crosses to the 125 MHz FIC0 clock on that port. `DESIGN_ONLY=1` builds
only the SmartDesign, about two minutes, to check the wiring before a full build.

| Build | Lab 49 (design 101) | Lab 54 (design 102) |
|---|---|---|
| Logic elements | 36,373 (38.9 %) | 44,191 (47.3 %) |
| Worst slack, 125 MHz | 1.021 ns | 1.329 ns |
| Worst slack, 50 MHz | 2.056 ns | 2.312 ns |

Timing met in every corner, maximum and minimum. Program it as in lab 49, with the gateway shut down. Programming and
verification passed, the design version read back is `0x66` and the boot flash digest is unchanged. The gateway came back
in about 30 seconds.

What Libero shows for this build, from a copy of the finished project (nothing was run or changed). The whole top-level
canvas: the new block is the small grey one in the middle, between the bus peripherals and the FIC0 block.

[![The whole top-level SmartDesign canvas of design 102 in Libero SoC](/aegis/libero/libero-aegis2-top-canvas.png)](/aegis/libero/libero-aegis2-top-canvas.png)

Zoomed on the block and its two connections:

![The zoomed canvas with callouts on aegis_pqc2_0, FIC_3_PERIPHERALS_0, the new AEGIS_DMA port of FIC_0_PERIPHERALS_0 and the processor subsystem's FIC_0_AXI4_TARGET](/aegis/diagrams/libero-aegis2-canvas-annotated.svg)

The design hierarchy: a port wrapper, the block, and inside it lab 49's NTT and the new sponge.

![The Libero design hierarchy with callouts on aegis_pqc2_fic0, aegis_pqc2, aegis_ntt and aegis_sponge](/aegis/diagrams/libero-aegis2-hierarchy-annotated.svg)

The gateway notices the new fabric. Its own quote is refused afterwards with `measurement changed: design_digests_sha256,
design_info`, as in [lab 48](/projects/fpga-soc/microchip-polarfire-soc/aegis/identity-and-quotes/a02-gateway-identity-and-quote/),
until the new design is enrolled on purpose. Check before enrolling that the identity key is unchanged and that only
those two fields moved.

### 4. Run it on the board

```sh
tools/build_liboqs_sponge.sh rv64
GATEWAY=<address> tools/accel/board_sponge_test.sh
```

It copies liboqs with the provider to the gateway and runs the same checks with `AEGIS_PQC_SPONGE=hw`: 11 of 11 pass.
Every SHA-3 call of liboqs runs on the block, the known-answer outputs are byte-identical to plain liboqs, and the 265
NIST ACVP cases pass with 8 slots and with 1. The board regression has a new stage for it and gives 13 of 13.

Raw timings from `sponge_bench`, next to what the first prediction had to assume:

| | Measured | Assumed |
|---|---|---|
| Permute, then the first read (the read waits on the bus) | 0.74 us | |
| Slot switch, then the first read | 1.30 us | 1.24 us |
| First DMA block reported after the command | 2.90 us | 2.2 us |
| Each further DMA block (168 bytes) | 1.13 us | 1.2 us |
| Non-cached read from the DMA page | 0.174 us per 8 bytes | 0.113 us |

## The result

liboqs `speed_kem` and `speed_sig` on one U54 core, two runs each, mean:

| Operation | Software | Lab 49 block | Lab 54 block | Speed-up |
|---|---|---|---|---|
| ML-KEM-768 key generation | 1.22 ms | 1.32 ms | 0.94 ms | **1.29** |
| ML-KEM-768 encapsulation | 1.44 ms | 1.51 ms | 1.14 ms | **1.26** |
| ML-KEM-768 decapsulation | 1.78 ms | 1.87 ms | 1.40 ms | **1.27** |
| ML-DSA-65 key pair | 3.95 ms | 4.48 ms | 2.57 ms | **1.54** |
| ML-DSA-65 sign | 13.87 ms | 15.5 ms | 11.63 ms | **1.19** |
| ML-DSA-65 verify | 4.09 ms | 4.57 ms | 2.78 ms | **1.47** |

The lab 49 column was measured in lab 49; the software and lab 54 columns in one session on the same board. Signing varies
between runs because of its rejection loop: another run gave 1.27.

The first prediction was 1.28 to 1.74. It was optimistic only through the two numbers it had to assume, the latency to
the first DMA block and the cost of reading non-cached memory. With those two measured, the same model is within 2.5 % of
every operation above.

## A bug only the board could show

The first run on the board passed everything with one slot and failed with eight. The block's current slot survives
from one program to the next: only a reset sets it to 0. The driver assumed slot 0 at start. On the PC every program got
a fresh model, so the tests could not see it; on the board, a program run after another one saved and loaded the wrong
slots. The driver now reads the current slot from the status register at start, and the PC test starts the model in
slot 5: it fails without the fix and passes with it.

## What is still slow

- **Reading non-cached memory**, 0.174 microseconds per 8 bytes, is now the largest cost on the hashing side. A cached
  mapping with cache maintenance, or sampling polynomials in the fabric so fewer bytes come back, are the next steps.
- **Signing** is mostly polynomial arithmetic, about 9 of its 14 milliseconds. A faster hash cannot fix that; keeping
  the NTT's data in the fabric across a whole matrix-vector product could.

## What to check

- `run_all.sh` ends with `tb_aegis_pqc2: PASS`; `test_sponge_provider.sh` reports 18 of 18.
- The design version reads back as `0x66` and the block's ID at 0x40000E00 is `0xAE150002`.
- `board_sponge_test.sh` reports 11 of 11, and the speed table shows the block faster than software on every operation.

## Where it can go wrong

- **One program at a time.** Two programs using the block at once would mix their slots. The regression and the speed
  tests run one after the other.
- **The DMA page.** The block writes into the last 4 KiB of pfdaq's non-cached buffer, far from where pfdaq's captures
  start; a capture that filled the whole 32 MiB buffer would collide with it. Only 32-bit addresses are reachable.
- **Lab 49's tools need rebuilding.** Its driver checked for the old block's ID; the current one accepts both and clears
  XOR mode before its plain writes.
- **Re-enrol after programming,** and check what changed before you do.
- **Rolling back:** program design 101 again and restore the previous enrolment record.
