+++
title = "pfdaq results and evidence"
description = "Every test of the pfdaq system, its method, result and record, and the failures found along the way."
weight = 70

[params]
  topics = ["Reference"]
  toc = true
+++

Last updated 2026-11-15 (fabric v0.5.1). Evidence classes: **SIM** (simulation), **HOST** (host-side check), **BUILD** (tool/build output), **BOARD** (measured on the physical board). A result is only claimed in the class shown. Numbers are from single runs unless a count is given.

The final board run is `tests/board/pfdaq_final_suite.sh` (FreeRTOS on U54_4) and `tests/board/pfdaq_bm_suite.sh` (bare-metal U54_4), summarised by `tests/host/summarise_suite.py`. Records are under `evidence/`, each with a manifest entry giving command and conditions:

- **FreeRTOS:** 27/27 functional tests pass, 13 measurements, 2 known issues (`evidence/v0.5.1/board/suite-freertos.md`); repeated on a freshly written card of the final image with the same result (`evidence/v0.5.1/board/suite-fresh-card.md`).
- **Bare metal:** 8/8 functional tests pass (`evidence/v0.5.1/board/suite-baremetal.md`).

## 1. Results by test

| ID | Test | Class | Method | Result | Evidence |
|---|---|---|---|---|---|
| T1a | Baseline boot repeat | BOARD | 20 warm reboots of the vendor image | 20/20, 40.6-41.5 s | raw log, not published |
| T1b | AMP boot repeat | BOARD | Warm reboots over SSH; per cycle: remoteproc, supervisor channel, supervised capture | 12/12, 6/6, 6/6, 30/30 (46-61 s to SSH) | `evidence/v0.5.1/board/reboot-30.csv` (the 30-cycle run) |
| T1c | Fresh-card cold boot | BOARD | Image written to a card, cold start, no manual fixes | 3/3 (v0.3, v0.4 and final v0.5.1 images); on the final card the full suite passes 27/27 | `evidence/v0.5.1/board/suite-fresh-card.md`; console logs not published |
| T2 | Register access | SIM + BOARD | APB reads/writes in the testbench; readback on the board | SIM pass (coefficients, mode, credits included); BOARD ID/VERSION and configuration read back | `evidence/v0.5.1/sim/stream.txt` |
| T3 | Interrupt delivery | BOARD | DMA completion count vs transfers; latency unit EVENTS vs ACKS | One completion per transfer (17,000 in the soak on fabric v0.3.0); EVENTS = ACKS in every U54_4 latency run | `evidence/v0.3.0/board/soak-10min.json`, suite records |
| T4 | Data integrity | SIM + BOARD | Sequence, payload model and CRC-32 per frame against an independent model | SIM: 20 stream scenarios pass. BOARD: counter, PRBS and FIR bursts 0 errors; 10-minute soak 17.4 M frames 0 errors (fabric v0.3.0, counter payload) | `evidence/v0.5.1/sim/stream.txt`, `evidence/v0.5.1/board/suite-freertos.md`, `evidence/v0.3.0/board/soak-10min.json` |
| T5 | DMA boundaries | BOARD | 1-word frames to 8.19 MB bursts, guard words after the buffer | Pass for even frame lengths. **Odd frame lengths in multi-frame bursts fail** (known issue K1) | suite records |
| T6 | Throughput, backpressure, real-time drops | BOARD | Fabric timestamps; real-time slot sweep 1 ms to 5 us per 1 KiB frame with 4 destinations | Fabric 931-947 MB/s (measured on fabric v0.3.0, not repeated on v0.5.1). Real-time: no drops at 1 ms slots, 1 drop in 4,000 at 100 us slots (the 1,000-slot fault run at 100 us dropped none); 20 % drops at 50 us slots (about 20 MB/s offered) and more above; drops from 50 us slots (about 20 MB/s offered) upward, every drop accounted for in DROPS and sequence gaps, 0 data errors at every rate | suite records |
| T7 | Cross-context memory visibility | BOARD | Linux writes a pattern, U54_4 verifies and writes the inverse, Linux verifies; uncached and cached, no cache maintenance | 0 mismatches in 50 × 64 K words each way, uncached and cached, FreeRTOS and bare metal | suite records |
| T8 | Interrupt latency and jitter | SIM + BOARD | Fabric latency unit, 20 ns resolution, 100,000 events per condition | See section 1b | suite records, `evidence/v0.5.1/sim/latency.txt` |
| T9 | Fault handling and recovery | SIM + BOARD | Fabric faults per payload mode; Linux stall vs deadline; consumer killed mid-run; remoteproc stop/start | All injected faults detected exactly (all three modes); deadline: 1 miss, alarm, recovery; after kill -9 the supervisor alarms and the next run passes. Remoteproc stop works, **start fails** (known issue K2) | suite records |
| T10 | Long-run stability | BOARD (short) | Supervised soak | 616.8 s, 17.83 GB, 0 errors, on fabric v0.3.0 with counter payload. Not repeated on v0.5.1; the planned 12 h run was not done | `evidence/v0.3.0/board/soak-10min.json` |
| T11 | Timing closure | BUILD | Multi-corner STA; I/O placement check | v0.5.1: max/min met, 64/64 I/Os placed; without `pfdaq_cdc.sdc` all 40 violating paths the tool lists (its 20 worst per report) are the intended crossings; a complete path list was not kept | `evidence/v0.5.1/build/timing-and-utilisation.txt`, `evidence/v0.5.1/build/timing-without-cdc-constraints.txt` |
| T12 | Programming integrity | BOARD | FlashPro Express PROGRAM, VERIFY, DEVICE_INFO | Passed every time (8 programmings); eNVM digest identical throughout | `evidence/v0.5.1/build/programming.txt` (latest programming; earlier logs not published) |
| T13 | Graceful abort | SIM + BOARD | ABORT during an 8 MB burst (2 ms) and an 8,000-frame FIR burst (50 us) | DMA completes, all frames before the abort intact, rest zero-filled, nothing past the buffer, next run normal | suite records, `evidence/v0.5.1/sim/stream.txt` |

## 1b. Interrupt-to-acknowledge latency (BOARD, fabric v0.5.1, 100,000 events each)

| Who acknowledges | Load | Min us | Mean us | p99 <= us | Max us | Missed |
|---|---|---|---|---|---|---|
| Bare-metal interrupt handler (U54_4) | idle | 0.50 | 0.50 | 0.62 | 3.10 | 0 |
| Bare-metal interrupt handler (U54_4) | Linux loaded | 0.50 | 0.51 | 0.94 | 2.44 | 0 |
| FreeRTOS interrupt handler (U54_4) | idle | 0.52 | 0.52 | 0.62 | 2.10 | 0 |
| FreeRTOS interrupt handler (U54_4) | Linux loaded | 0.52 | 0.53 | 0.94 | 1.94 | 0 |
| FreeRTOS task (U54_4) | idle | 2.00 | 2.04 | 2.54 | 11.66 | 0 |
| FreeRTOS task (U54_4) | Linux loaded | 2.00 | 2.09 | 3.82 | 9.36 | 0 |
| Linux kernel handler (`pfdaq_uio`) | idle | 1.36 | 4.41 | 10.22 | 1298 | 6 |
| Linux kernel handler | loaded | 1.50 | 3.95 | 10.22 | 1280 | 11 |
| Linux user space (UIO) | idle | 4.18 | 78.3 | 122.9 | 5131 | 89 |
| Linux user space, SCHED_FIFO 80 | idle | 2.58 | 76.1 | 122.9 | 1674 | 7 |
| Linux user space, SCHED_FIFO 80 | loaded | 2.24 | 73.6 | 122.9 | 1815 | 18 |

- **Event period:** 200 us for the U54_4 and kernel rows, 500 us for user space.
- **"Loaded":** one busy loop on each Linux CPU plus a continuous capture loop.
- **"Missed":** an event that became due while the previous one was still unacknowledged.
- **Reading the table:** the U54_4 context never missed an event. FreeRTOS adds about 20 ns over bare metal in the interrupt handler, and about 1.5 us when a task does the work. Linux, even in the kernel handler, has rare stalls of 1-5 ms, so it is characterised here rather than given a bound.

## 2. Failures found and what they led to

| Finding | Class | Consequence |
|---|---|---|
| Delivered fabric did not match v2026.04 (no MMUART0 route, 8 kernel clock warnings) | BOARD | Reference fabric programmed |
| Status readback path failed timing (-0.707 ns) | BUILD | Snapshot copied into the bus clock domain |
| "Done" never set after that change | SIM | Single crossing carrying data and flag |
| Python register writes arrived byte by byte | BOARD | `libmmio.so`; C tools use real 32-bit stores |
| Packets above about 360 bytes corrupted, DMA hung | BOARD | Two words per clock, continuous TVALID |
| Re-armed descriptor ignored once a packet was waiting | BOARD | Arm-before-start protocol; real-time mode uses credits so this can't happen |
| Kernel driver clears the DMA status flag | BOARD | Completion from UIO interrupt + descriptor bit |
| `/dev/mem` refused for the source registers | BOARD | UIO device-tree node |
| Vendor RPMsg example flow did not match this kernel | BOARD | Endpoint discovery handles both layouts |
| Every Linux latency event woke the process twice | BOARD | Acknowledge only when the fabric reports pending |
| FreeRTOS task-mode latency: line stayed masked after the first event | BOARD | Mask in the handler before waking the task (the port switches tasks inside the ISR) |
| Kernel UIO driver could not be mapped | BOARD | Page-aligned memory map with offset, as in `uio_pdrv_genirq` |
| Brackets in register names unmatched by SDC patterns (three failed builds) | BUILD | Paths named by source and destination register groups |
| Build script dropped all I/O constraints; board stuck in an HSS reset loop | BOARD | File list fixed; builds now stop unless every I/O is placed |
| An early TLAST does not complete a DMA transfer (abort left the DMA waiting) | BOARD | Abort finishes the frame, then zero-fills to the full length |
| One-cycle TVALID gap when an abort hit a frame boundary | SIM | First fill beat sent in the same clock |
| Odd frame lengths in multi-frame bursts lose 2 KB chunks | BOARD | **Known issue K1**, refused by `pfdaq_cap` unless `-O` |
| Remoteproc restart rejected by HSS | BOARD | **Known issue K2**, recovery is a reboot |
| FreeRTOS did not start on one early boot | BOARD | **Open**, 1 in about 60 boots, not seen since |

## 3. Not covered

- **Repeated cold power cycles:** these need someone at the power cable or a switchable supply.
- **The 12 h soak:** not run; only a 10-minute soak was done.
- **Root cause of K1:** this would need the vendor DMA RTL in simulation.
- **Electrical and environmental:** no temperature, voltage or electrical measurement.
- **A second board:** every BOARD result is from one unit.

## 4. Instrumentation limits

- **Fabric timestamps:** resolution is one 125 MHz period (8 ns), and the counter wraps at 32 bits (about 34 s).
- **Latency unit:** resolution is 20 ns, counted from the first cycle the line is high to the APB write of ACK.
- **"START to interrupt":** includes the register write, the transfer, interrupt delivery and the wake-up of a user process.
- **RPMsg round trips:** include two user/kernel transitions on Linux and a 1 ms delay in the supervisor's snapshot.
- **"Delivered MB/s" in real-time runs:** measured over the whole loop including the final wait, so it understates the rate. The sent/dropped counts are the meaningful figures.

## 5. How to rerun

| What | Command |
|---|---|
| Stream simulation | `make -C hw sim-stream` |
| Latency simulation | `make -C hw sim-latency` |
| Full board suite | copy `tests/board/pfdaq_final_suite.sh` to the board, run it, then `tests/host/summarise_suite.py <output>` on the PC |
| Bare-metal comparison | `firmware/build_payload.sh`, write `build/payload-bm/payload.bin` to SD partition 2, reboot, run `tests/board/pfdaq_bm_suite.sh`; write the image's own `payload.bin` back afterwards |
| Reboot test (PC) | `tests/host/amp_reboot_test.sh 30 out.csv <board address> <freertos console log>` |
| Single runs (board) | `pfdaq_cap -r -m fir -S 333 -w 252 -f 1024 -n 32`, `pfdaq_cap -m prbs -w 252 -T 12500 -n 4000 -d 4`, `pfdaq_cap -A 2000 -m prbs -w 4092 -f 500`, `pfdaq_lat -c 1 -p 200 -n 100000`, `pfdaq_cap -X 65536 -n 50 [-c]` |

## Evidence records

Each record below can be downloaded. The command and conditions are those under which it was produced; a number on any page of this site is quoted from one of these.

| Record | Kind | Fabric | Date | Command | Conditions |
|---|---|---|---|---|---|
| [Toy chain of trust, six scenarios](/pfdaq/evidence/host/secure-boot/chain-demo.txt) | host | none | 2026-11-15 | `python3 experiments/secure-boot-chain/chain_demo.py` | Python 3.12 with the cryptography package. Keys are generated fresh on every run, so only the messages are reproducible. |
| [Signing an HSS payload offline and verifying it with two independent implementations](/pfdaq/evidence/host/secure-boot/sign-and-verify.txt) | host | none | 2026-11-15 | `experiments/secure-boot-chain/sign_and_verify.sh` | hss-payload-generator v0.99.44 from the Yocto build, OpenSSL 3.0, throwaway keys, the bare-metal payload configuration built by firmware/build_payload.sh. Nothing was flashed. |
| [Ten-minute supervised soak, 17.8 GB, no errors](/pfdaq/evidence/v0.3.0/board/soak-10min.json) | board | v0.3.0 | 2026-11-15 | `pfdaq_cap -r -w 252 -f 1024 -n 17000` | Counter payload only, 1 MiB bursts of 1 KiB frames, FreeRTOS supervisor with a 500 ms deadline, board otherwise idle. 616.8 s. |
| [Fabric-side throughput of single bursts, 931 to 947 MB/s](/pfdaq/evidence/v0.3.0/board/suite-python-x3.txt) | board | v0.3.0 | 2026-11-15 | `tests/legacy/pfdaq_suite.sh, repeated runs` | Computed from the fabric's own 125 MHz timestamps over one burst, 80 KB to 8 MB, measured with the earlier Python tool. It is the rate at which the source and the DMA move data into DDR, with no software in the path. |
| [Board suite with FreeRTOS on hart 4, 27 of 27 functional tests](/pfdaq/evidence/v0.5.1/board/suite-freertos.md) | board | v0.5.1 | 2026-11-15 | `tests/board/pfdaq_final_suite.sh on the board, summarised by tests/host/summarise_suite.py` | Board idle except where a row says loaded. "Loaded" is one busy loop per Linux CPU plus a continuous capture loop. Latency rows are 100,000 events each. |
| [Raw output of the FreeRTOS suite, one JSON object per test](/pfdaq/evidence/v0.5.1/board/suite-freertos.jsonl) | board | v0.5.1 | 2026-11-15 | `tests/board/pfdaq_final_suite.sh` |  |
| [The same suite on a freshly written SD card, 27 of 27](/pfdaq/evidence/v0.5.1/board/suite-fresh-card.md) | board | v0.5.1 | 2026-11-15 | `image written to a blank card, cold start, tests/board/pfdaq_final_suite.sh with no manual steps` | Proves the published image alone reproduces the result. |
| [Raw output of the fresh-card suite](/pfdaq/evidence/v0.5.1/board/suite-fresh-card.jsonl) | board | v0.5.1 | 2026-11-15 | `tests/board/pfdaq_final_suite.sh` |  |
| [Board suite with the bare-metal supervisor on hart 4, 8 of 8](/pfdaq/evidence/v0.5.1/board/suite-baremetal.md) | board | v0.5.1 | 2026-11-15 | `firmware/build_payload.sh, payload written to SD partition 2, tests/board/pfdaq_bm_suite.sh` | Same fabric and Linux image; only the hart 4 firmware differs. |
| [Raw output of the bare-metal suite](/pfdaq/evidence/v0.5.1/board/suite-baremetal.jsonl) | board | v0.5.1 | 2026-11-15 | `tests/board/pfdaq_bm_suite.sh` |  |
| [Thirty warm reboots, both systems up and a supervised capture passing each time](/pfdaq/evidence/v0.5.1/board/reboot-30.csv) | board | v0.5.1 | 2026-11-15 | `tests/host/amp_reboot_test.sh 30` | Warm reboots over SSH. Time is from the reboot command to SSH reachable. |
| [Supervisor console during the fresh-card suite, with the alarm and recovery messages](/pfdaq/evidence/v0.5.1/board/supervisor-console.txt) | board | v0.5.1 | 2026-11-15 | `hart 4 console (MMUART0) captured on the PC during tests/board/pfdaq_final_suite.sh` |  |
| [Stream source simulation, 20 scenarios checked by the Python model](/pfdaq/evidence/v0.5.1/sim/stream.txt) | sim | v0.5.1 | 2026-11-15 | `make -C hw sim-stream` | Icarus Verilog 12.0. The checker recomputes every frame and checks the stream protocol beat by beat. |
| [Latency unit simulation, four phases checked by the Python model](/pfdaq/evidence/v0.5.1/sim/latency.txt) | sim | v0.5.1 | 2026-11-15 | `make -C hw sim-latency` |  |
| [Place and route result, timing met in all corners, 64 of 64 pins placed, 26 % of the fabric](/pfdaq/evidence/v0.5.1/build/timing-and-utilisation.txt) | build | v0.5.1 | 2026-11-15 | `hw/libero/build.sh 6` | Libero SoC 2026.1, extracted lines of the build log. |
| [Timing analysis without the clock-crossing constraints (the tool's console log; the 40 worst violating paths it lists are the intended crossings)](/pfdaq/evidence/v0.5.1/build/timing-without-cdc-constraints.txt) | build | v0.5.1 | 2026-11-15 | `hw/libero/sta_without_cdc.tcl on the placed design` |  |
| [Programming, verify and device read-back of the v0.5.1 fabric](/pfdaq/evidence/v0.5.1/build/programming.txt) | board | v0.5.1 | 2026-11-15 | `hw/libero/program.sh` | FABRIC and SNVM components only. The eNVM digest is the same before and after. |
| [Boot monitor console from power-up to all four application cores running](/pfdaq/evidence/v0.5.1/board/boot-hss.txt) | board | v0.5.1 | 2026-11-15 | `HSS console (MMUART1) captured on the PC during a cold boot of the final image` | Boot monitor v0.99.53-v2026.04.1 as found in the chip's boot flash. Blank lines removed; timestamps are the monitor's own. |
| [Key lines of the U-Boot and Linux console from OpenSBI to login, including remoteproc attaching to hart 4](/pfdaq/evidence/v0.5.1/board/boot-uboot-linux.txt) | board | v0.5.1 | 2026-11-15 | `Linux console (MMUART4) captured on the PC during a cold boot of the final image` | Filtered to the lines that mark each stage; repeated lines removed. The full capture is not published. |
| [Reserved memory, UIO devices, online CPUs and PLIC sources on the running board](/pfdaq/evidence/v0.5.1/board/device-tree-checks.txt) | board | v0.5.1 | 2026-11-15 | `grep of /proc/iomem, dmesg, /sys/class/uio/*/name, /sys/devices/system/cpu/online and /proc/interrupts over SSH, about one minute after a warm reboot` | Proven pfdaq-v051 image, FreeRTOS on hart 4. Read-only commands. |
| [100,000 fabric interrupts answered by Linux, then by hart 4, with the interrupt counters after each](/pfdaq/evidence/v0.5.1/board/fabric-interrupts-run.txt) | board | v0.5.1 | 2026-11-15 | `pfdaq_lat -c 0 -p 500 -n 100000, then pfdaq_cap -L 0 and pfdaq_lat -c 1 -p 200 -n 100000, with /proc/interrupts and the UIO event files read after each` | Single run each, board idle, counters read right after a warm reboot. |
| [One 16-frame burst through the fabric DMA from a 138-line user-space program, run twice](/pfdaq/evidence/v0.5.1/board/dma-one-burst.txt) | board | v0.5.1 | 2026-11-15 | `experiments/I04-dma-one-burst/dma_one_burst, built statically with a RISC-V Linux GCC, copied to the board and run as root` | Proven pfdaq-v051 image; nothing else using the stream source. The second run follows the first without a reboot. |
| [The Libero design flow as listed for the project](/pfdaq/evidence/v0.5.1/build/libero-design-flow.png) | build | v0.5.1 | 2026-11-15 | `Design Flow panel of the Libero SoC 2026.1 GUI, project opened read-only (a copy)` | Screenshot of Libero SoC 2026.1 running on the development PC, taken from a copy of the project built from the restructured layout (design version 7), whose fabric component digest equals the one programmed on the board. Nothing was built, saved or programmed while taking it. |
| [The design hierarchy: reference design blocks and the added pfdaq_core](/pfdaq/evidence/v0.5.1/build/libero-hierarchy.png) | build | v0.5.1 | 2026-11-15 | `Design Hierarchy panel with MPFS_DISCOVERY_KIT, FIC_0_PERIPHERALS and FIC_3_PERIPHERALS expanded` | Screenshot of Libero SoC 2026.1 running on the development PC, taken from a copy of the project built from the restructured layout (design version 7), whose fabric component digest equals the one programmed on the board. Nothing was built, saved or programmed while taking it. |
| [Top-level SmartDesign canvas: clocks and resets, MSS, FIC_0 and FIC_3 blocks](/pfdaq/evidence/v0.5.1/build/libero-top-smartdesign.png) | build | v0.5.1 | 2026-11-15 | `SmartDesign canvas of MPFS_DISCOVERY_KIT` | Screenshot of Libero SoC 2026.1 running on the development PC, taken from a copy of the project built from the restructured layout (design version 7), whose fabric component digest equals the one programmed on the board. Nothing was built, saved or programmed while taking it. |
| [FIC_0_PERIPHERALS canvas: pfdaq_core, DMA controller, initiator and target interconnects, MSS_LSRAM](/pfdaq/evidence/v0.5.1/build/libero-fic0-peripherals.png) | build | v0.5.1 | 2026-11-15 | `SmartDesign canvas of FIC_0_PERIPHERALS` | Screenshot of Libero SoC 2026.1 running on the development PC, taken from a copy of the project built from the restructured layout (design version 7), whose fabric component digest equals the one programmed on the board. Nothing was built, saved or programmed while taking it. |
| [FIC_3_PERIPHERALS canvas: APB address decode and the reference design peripherals](/pfdaq/evidence/v0.5.1/build/libero-fic3-peripherals.png) | build | v0.5.1 | 2026-11-15 | `SmartDesign canvas of FIC_3_PERIPHERALS` | Screenshot of Libero SoC 2026.1 running on the development PC, taken from a copy of the project built from the restructured layout (design version 7), whose fabric component digest equals the one programmed on the board. Nothing was built, saved or programmed while taking it. |
| [MSS Configurator, Peripherals tab: enabled peripherals and I/O mux](/pfdaq/evidence/v0.5.1/build/libero-mss-peripherals.png) | build | v0.5.1 | 2026-11-15 | `MSS Configurator opened from the MSS component in read-only mode` | Screenshot of Libero SoC 2026.1 running on the development PC, taken from a copy of the project built from the restructured layout (design version 7), whose fabric component digest equals the one programmed on the board. Nothing was built, saved or programmed while taking it. |
| [MSS Configurator, fabric interface controllers tab](/pfdaq/evidence/v0.5.1/build/libero-mss-fics.png) | build | v0.5.1 | 2026-11-15 | `MSS Configurator, tab MSS to/from Fabric Interface Controllers` | Screenshot of Libero SoC 2026.1 running on the development PC, taken from a copy of the project built from the restructured layout (design version 7), whose fabric component digest equals the one programmed on the board. Nothing was built, saved or programmed while taking it. |
| [MSS Configurator, Clocks tab: MSS PLL, dividers and the clock tree](/pfdaq/evidence/v0.5.1/build/libero-mss-clocks.png) | build | v0.5.1 | 2026-11-15 | `MSS Configurator, tab Clocks` | Screenshot of Libero SoC 2026.1 running on the development PC, taken from a copy of the project built from the restructured layout (design version 7), whose fabric component digest equals the one programmed on the board. Nothing was built, saved or programmed while taking it. |
| [MSS Configurator, DDR Memory tab: DDR4 topology and clock](/pfdaq/evidence/v0.5.1/build/libero-mss-ddr.png) | build | v0.5.1 | 2026-11-15 | `MSS Configurator, tab DDR Memory` | Screenshot of Libero SoC 2026.1 running on the development PC, taken from a copy of the project built from the restructured layout (design version 7), whose fabric component digest equals the one programmed on the board. Nothing was built, saved or programmed while taking it. |
| [Verify Timing report, max delay multi-corner summary](/pfdaq/evidence/v0.5.1/build/libero-timing-summary.png) | build | v0.5.1 | 2026-11-15 | `Reports view of Libero, file max_timing_multi_corner` | Screenshot of Libero SoC 2026.1 running on the development PC, taken from a copy of the project built from the restructured layout (design version 7), whose fabric component digest equals the one programmed on the board. Nothing was built, saved or programmed while taking it. |
