+++
title = "Reproduce the Aegis bench"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "From a PC and three boards to a gateway that admits one device, quarantines two others and passes its regression, with the change made to each board and how to undo it."
weight = 10

[params]
  lab = 47
  board = "PolarFire SoC Discovery Kit, STM32H573I-DK, Arduino Uno R3"
  core = "U54 (Linux), Cortex-M33, development PC"
  level = "Advanced"
+++

After this page you can set up the three boards and the PC so that the gateway admits the STM32, quarantines a modified
firmware image and an Arduino that cannot attest, and the regression passes. You also know what was changed on each
board and how to put it back.

**Read this first.** The project did not run this page as one unbroken session. It ran the steps in pieces over a few
days, on boards that already ran the [pfdaq](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/) system. Each command below
is from a script in the repository, and each result is one the project recorded, but the sequence has not been replayed
from empty boards. Two steps depend on earlier work and are marked.

## Before you start

- **Gateway:** a PolarFire SoC Discovery Kit running the pfdaq image and fabric. Do that first with
  [reproduce the board from an empty SD card](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/boot-and-images/x03-reproduce-from-empty-sd/).
  The Aegis services only need that Linux image and an SSH key; the fabric accelerator is optional.
- **Endpoint:** an STM32H573I-DK with an Ethernet cable, an ST-LINK USB cable and STM32CubeProgrammer. The secure-image
  build reuses the dependencies fetched by the TF-M work in
  [the TF-M real-time cost project](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/); you need that workspace
  or the same TF-M v2.3.0 sources and an Arm GNU toolchain.
- **Legacy node:** an Arduino Uno R3 and a USB cable.
- **Network:** the gateway and the STM32 on the same Ethernet segment with DHCP. The Uno is connected to the PC by USB.
- **Host:** Ubuntu 24.04 on x86-64, Libero SoC 2026.1 with a licence if you build the fabric, Python 3.12. Plan for
  about 1.5 GB for the tools the setup script downloads.

### Two things that protect the boards

1. **The STM32 is left in its open product state.** Nothing here closes it or changes option bytes. Back up all of its
   flash before the first write, as the steps below do; the restore script was tested.
2. **Nothing writes the PolarFire's boot flash, keys or security locks.** The fabric job contains the fabric and sNVM
   components only.

## The idea

Three things make the bench, and they are independent:

| What | Where it lives | How it gets there |
|---|---|---|
| The **gateway services** (`aegisd`, `aegis-fleet`) and the liboqs build they use | `/root/aegis` on the PolarFire | copied over SSH, started by systemd |
| The **endpoint's secure partition** and prover image | the STM32's two firmware slots | built on the PC, written with STM32CubeProgrammer |
| The **policy**: which endpoints exist and which measurements are allowed | one JSON file on the gateway | copied from the example and edited |

## Run it

### 1. Host tools

```sh
git clone https://github.com/ismailalitech/aegis && cd aegis
tools/setup_host.sh
cp bench.env.example bench.env      # then edit the addresses
```

The script builds everything under one folder and the repository's virtual environment, without root: a Python
environment, the Arm GNU toolchain 14.2.rel1 (its SHA-256 is checked against Arm's), the STM32H5 device pack, liboqs 0.16.0
with only ML-KEM and ML-DSA, and the NIST test vectors (checked against the recorded checksums).

### 2. Check the host stages

```sh
tools/regression.sh
```

Five stages run with no hardware: unit tests, the red-team harness against the parsers, the RTL simulation, the NIST vectors
through liboqs, and the vector checksums. Expected: `passed 5, failed 0`. The same stages run on every push in GitHub
Actions.

### 3. Gateway software

Copy the repository's `gateway/`, `common/` and a RISC-V build of liboqs to `/root/aegis` on the board (build it with
`tools/build_liboqs_fabric.sh`, which also routes Keccak through the fabric when asked), then install the services:

```sh
python3 /root/aegis/gateway/aegisd/aegisd.py init --state /var/lib/aegis   # creates the identity key and record
/root/aegis/gateway/systemd/install.sh
```

`init` generates the gateway's ML-DSA-65 key from the kernel's random pool and stores it in `/var/lib/aegis/` with
restricted permissions, because this chip does not hold it in hardware. `aegisd` listens on TCP 7443 and signs the
gateway's quote; `aegis-fleet` runs the decision cycle. **Never unload the `mpfs-generic-service` kernel module**: it has no
remove path and the board becomes unreachable. To remove it, reboot.

Optional: build and program the fabric accelerator
([lab 49](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a03-fabric-accelerator/)) with
`hw/libero/build.sh 101`. Without it the services use software Keccak.

### 4. Enrol the gateway on the PC

```sh
.venv/bin/python host/aegis_verify.py enroll <gateway>
.venv/bin/python host/aegis_verify.py quote  <gateway>
```

Enrolment stores the gateway's public key and one quote as the reference. It is only as trustworthy as the network at that
moment: do it on a bench you control. The second command should print an accepted quote.

### 5. Endpoint

```sh
.venv/bin/python tools/gen_gateway_pin.py <gateway>                      # pin the gateway's ML-DSA key into the secure image
endpoints/stm32h573/tfm-aegis-partition/build_tfm.sh    # TF-M v2.3.0 + the Aegis partition
endpoints/stm32h573/prover-ns/build.sh                  # the Non-Secure prover
```

Back up the board first (all flash, both security views, the option bytes), then write the secure and non-secure images with
STM32CubeProgrammer. `endpoints/stm32h573/restore_from_backup.sh` restores both slots; the project tested that the slots
read back byte-identical to the backup. The prover prints its DHCP address on the console; it serves the line protocol on
TCP 7444.

### 6. Policy and first attestation

Copy `gateway/policy/fleet.example.json` to `fleet.json` on the gateway, put in the endpoint's address, and let the service
enrol its device key on first use (trust on first use again). The allowed measurements are the SHA-256 of each signed image;
`tools/image_measurement.py` prints them; [the token article](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/x03-measured-boot-and-the-token/)
shows its output for the images this bench runs, and the history of every build.

Within one cycle (30 seconds) the gateway journal shows the endpoint as admitted:

```text
stm32h573-dk ADMITTED  [credential: valid, heartbeat 12 (uptime_s=393;link=1;fw=0.4.0)]
```

### 7. The Arduino

Flash `endpoints/arduino-uno/legacy_sensor` after reading back the Uno's flash with avrdude. Then run the relay that exposes
its serial port on TCP 7445; the repository includes a systemd user unit for it in `host/systemd/`. The gateway journal
shows the Uno quarantined every cycle, with the reason that it cannot attest.

### 8. Everything together

```sh
tools/regression.sh --board     # 12 stages, about 90 seconds
tools/demo.sh                   # about 2 minutes: quote, attest, tamper, quarantine, restore, admit
```

Expected: `passed 12, failed 0`. The demo flashes a modified Non-Secure image and then the good one back, so the STM32 must be
connected to the PC's ST-LINK.

![The board regression printing twelve passing stages: five on the PC and seven on the boards](/aegis/diagrams/console-regression.svg)

## What was changed on each board, and how to undo it

| Board | Change | Undo |
|---|---|---|
| PolarFire | `/root/aegis/`, `/var/lib/aegis/`, two systemd units | remove the folders, `install.sh remove`, reboot |
| PolarFire | the fabric (only if you programmed the accelerator) | program the pfdaq fabric job again |
| PolarFire | a kernel with nf_tables, bridge and VLAN support in the boot partition | the bundle's `rollback.sh`, then reboot |
| STM32 | the secure and non-secure firmware slots | `restore_from_backup.sh` |
| Uno | the sketch in flash | write back the saved hex with avrdude |

Nothing writes the PolarFire's boot flash, keys or locks, the STM32's option bytes or product state, or the SD card's boot and
payload partitions.

## What to check

- If you built the fabric, the design flow in Libero shows green ticks on Synthesize, Place and Route and Verify Timing:

[![The Libero Design Flow panel with green check marks on Implement Design, Synthesize, Place and Route and Verify Timing](/aegis/libero/libero-aegis-design-flow.png)](/aegis/libero/libero-aegis-design-flow.png)

- The host regression passes on your PC before any board is touched.
- The gateway's quote is accepted by the enrolled verifier.
- The journal shows the STM32 admitted with a credential and a rising heartbeat, and the Uno quarantined.
- If a step fails, the usual cause is an address in `bench.env` or the policy file, or the endpoint's DHCP address changing.

## Where it can go wrong

- Writing the STM32's secure image without a backup. Keep the backup folder; it is the only way back to the original firmware.
- Unloading `mpfs-generic-service`. Reboot instead.
- Changing the gateway's fabric or code after enrolment. The PC verifier then refuses the quote, correctly, because the
  measurements changed; re-enrol the reference on purpose.
- A policy file left with old measurements after an image update. The service reloads it every cycle, so fix the file and wait.
