+++
title = "remoteproc: attach, stop, and why restart fails here"
date = '2026-11-15T12:00:00+01:00'
draft = false
description = "What Linux can and cannot do to a hart it did not start."
weight = 35

[params]
+++

After this module you can follow a real-time context through its life as Linux sees it: started by the boot monitor, attached by Linux, stopped by Linux, and then not restartable. You can also say which of those steps belong to which layer, and which the project controls.

## Before you start

- **Level 4.** You should know why one hart runs outside Linux (module M01). Case study K11 has the detailed trace of the failing restart; this page is the map around it and does not repeat it.
- **Tools:** none. Reading page; the evidence was recorded on the board earlier.

## The idea

Linux has a framework, **remoteproc**, for managing another processor from the main operating system. It does four jobs: load firmware into the remote processor's memory, read its **resource table** (a small description of the memory, rings and devices the firmware needs), start it, and set up the message channels. Usually Linux does all of it: the remote processor stays off until Linux starts it.

Here the order is reversed. The remote context is started **before Linux runs**, by the boot monitor, from the payload on the SD card. Linux arrives later and **attaches** to something that is already running. In this mode Linux never loaded the firmware and never started the hart. That explains most of what this page covers.

## On this board

### What the device tree says

The node `remote-context` in the project's device tree, `compatible = "microchip,ipc-sbi-remoteproc"`, names five memory regions and one mailbox:

| Name | Address | Size | Role |
|---|---|---|---|
| `firmware` | `0x91C0_0000` | 1 MiB | the real-time context's code and data, `no-map` so Linux never uses it |
| `vring0` | `0x91D0_0000` | 32 KiB | virtqueue ring |
| `vring1` | `0x91D0_8000` | 32 KiB | virtqueue ring |
| `buffer` | `0x91D1_0000` | 256 KiB | shared pool of message buffers |
| `rsc-table` | `0x91D5_0000` | 4 KiB | the resource table |

The mailbox is `mboxes = <&ihc 8>`: the inter-hart communication block in the fabric, which carries the notifications. Linux's own CPU 4 is marked `disabled` in the same file, so the kernel never schedules onto the hart that belongs to the other context.

### The life of the context, stage by stage

1. **The boot monitor starts it.** The monitor's console shows the state machine of hart 4, which runs without OpenSBI because the payload asks for it (`BOOT_FLAG_SKIP_OPENSBI`):

   ```
   boot_service(u54_4) :: [Init] -> [SetupPMP]
   boot_service(u54_4) :: [SetupPMPComplete] -> [ZeroInit]
   boot_service(u54_4) :: [ZeroInit] -> [Download]
   boot_service(u54_4)::Processing boot image: "polarfire-soc-freertos-amp-demo.elf"
   boot_service(u54_4) :: [Complete] -> [Idle]
   ```

   The monitor loads the ELF from the SD card, sets the hart's memory protection, and lets it run. From this moment hart 4 runs the supervisor.

2. **The context publishes its resource table.** The firmware copies its table to `0x91D5_0000` at start, where Linux will look for it.

3. **Linux attaches.** About 1.7 seconds into the kernel's boot:

   ```
   remoteproc remoteproc0: remote-context is available
   remoteproc remoteproc0: attaching to remote-context
   virtio_rpmsg_bus virtio0: rpmsg host is online
   remoteproc remoteproc0: remote processor remote-context is now attached
   virtio_rpmsg_bus virtio0: creating channel pfdaq-supervisor addr 0x0
   ```

   The last line is the supervisor's announcement: the message channel exists and the capture tool can open it.

4. **Linux can stop it.** Writing `stop` to the state file works; the state becomes `offline`.

5. **Linux cannot start it again.** Writing `start` leaves the state `offline`. Case study K11 follows the request to one address check in the boot monitor.

### What Linux can and cannot do to this hart

| Action | Works? | Why |
|---|---|---|
| Attach to the running context | yes | the resource table and rings are in reserved memory both sides know |
| Exchange messages (RPMsg) | yes | the supervisor announces `pfdaq-supervisor` after the link is up |
| Stop it | yes | the driver sends a shutdown message to the context over the mailbox |
| Start it again | **no** | the boot monitor refuses the start request (K11) |
| Load a different firmware into it | not through remoteproc | the firmware is loaded by the monitor from the SD card; the way to change it is to change the payload and reboot |

The names the driver reports are the standard remoteproc state names. This board showed two of them, `attached` and `offline`.

## Run it

The project's board suite does this in one test, `T9-remoteproc`. These are the commands from `tests/board/pfdaq_final_suite.sh`; they were run on the board earlier and are not repeated here.

```sh
R=/sys/class/remoteproc/remoteproc0
cat $R/state                        # attached
echo stop > $R/state ; cat $R/state # offline
echo polarfire-soc-freertos-amp-demo.elf > $R/firmware
echo start > $R/state ; cat $R/state
ls /sys/bus/rpmsg/devices/ | grep -c pfdaq-supervisor
```

The test passes only if the state after `start` is `running`, the channel is back and a capture works. It never passes.

## What you should see

The recorded result in the suite summary (`suite-freertos`):

| Field | Value |
|---|---|
| State before | `attached` |
| State after `stop` | `offline` |
| Firmware name set | `polarfire-soc-freertos-amp-demo.elf` |
| State after `start` | `offline` |
| RPMsg channel `pfdaq-supervisor` present | no (0) |

The suite reports it as a known issue, not a failure, so that its 27 functional tests can all pass while the limitation stays visible.

The attach lines in step 3 are from the boot record `boot-uboot-linux`; the hart's state machine in step 1 is from `boot-hss`.

## Evidence

- **Boot, from a freshly written SD card and from warm reboots:** the supervisor was attached every time in the 30-reboot test (`reboot-30` records `remoteproc` and the channel for each cycle), so attach is reliable on this board.
- **Stop and start:** one test, one result, the same on every run of the suite.
- **Not published:** the boot monitor's message `rproc buffer not in DDR` after each refused start. It is on the monitor's own serial port, in captures kept in the project's notes.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| State is `offline` after boot | The context was stopped, or it never started. Reboot (the way to recover) and check the boot monitor's console for hart 4's state machine |
| State `attached` but no channel `pfdaq-supervisor` | The firmware is running but has not announced the channel. In the boot record the announcement follows the attach line by about two tenths of a second. Once, in about 60 boots, the context did not start (case study K12) |
| `echo start` appears to succeed but nothing happens | Expected here (K11). Check the state afterwards: the write itself reports nothing useful |

## Trade-offs and going further

- **Starting the context early is what makes it dependable.** Because the monitor starts it before Linux, the supervisor runs even if Linux fails to boot, and its latency does not depend on Linux. The cost is the lost restart: restarting would need Linux to start a context that Linux never owned.
- **Attach is a convention.** Linux trusts that the resource table at the agreed address describes the running firmware. There is no check that it does; a mismatch would show as a missing channel.
- **A fix lives in the boot flash.** The restart check is in the boot monitor, in the chip's internal flash that this project never rewrites (module B06 explains why that flash is left alone).
- **Exercise:** the suite's `T9-remoteproc` discards the error output of `echo start`. What would you learn by recording it, and what would you still not know?

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **How to run** | Explanation with recorded evidence; nothing to run |
| **Status** | validated |
| **Read first** | [M01 Asymmetric multiprocessing on one chip](/topics/microcontrollers/linux-and-rtos/m01-asymmetric-multiprocessing/) |
| **In the system** | [U54 hart 4](/pfdaq/explorer/#u54-4) · [E51 (hart 0)](/pfdaq/explorer/#e51) · [RPMsg shared memory](/pfdaq/explorer/#ddr-rpmsg) · [Hart 4 image](/pfdaq/explorer/#ddr-u54-4-image) · [remoteproc and RPMsg](/pfdaq/explorer/#remoteproc-rpmsg) · [Hart Software Services](/pfdaq/explorer/#hss) · [pfdaq supervisor](/pfdaq/explorer/#supervisor) · [Linux 6.18.17](/pfdaq/explorer/#linux-kernel) |
| **Source files** | [`yocto/meta-pfdaq/recipes-kernel/linux/files/mpfs-disco-kit-amp.dts`](https://github.com/ismailalitech/pfdaq/blob/main/yocto/meta-pfdaq/recipes-kernel/linux/files/mpfs-disco-kit-amp.dts): `rproc_contextb`, `contextb_reserved`; [`tests/board/pfdaq_final_suite.sh`](https://github.com/ismailalitech/pfdaq/blob/main/tests/board/pfdaq_final_suite.sh) |
| **Evidence** | [Board suite with FreeRTOS on hart 4, 27 of 27 functional tests](/pfdaq/evidence/v0.5.1/board/suite-freertos.md) (board, fabric v0.5.1); [Key lines of the U-Boot and Linux console from OpenSBI to login, including remoteproc attaching to hart 4](/pfdaq/evidence/v0.5.1/board/boot-uboot-linux.txt) (board, fabric v0.5.1); [Boot monitor console from power-up to all four application cores running](/pfdaq/evidence/v0.5.1/board/boot-hss.txt) (board, fabric v0.5.1) |
| **Related** | [K11 remoteproc cannot restart the hart](/topics/microcontrollers/linux-and-rtos/k11-remoteproc-restart/); [M01 Asymmetric multiprocessing on one chip](/topics/microcontrollers/linux-and-rtos/m01-asymmetric-multiprocessing/); [B02 The HSS payload: starting two operating systems](/topics/embedded-linux/boot-and-images/b02-hss-payload/); [M02 RPMsg in practice: announce, bind, ping](/topics/microcontrollers/linux-and-rtos/m02-rpmsg-in-practice/); [K12 One boot in sixty, FreeRTOS never started](/topics/microcontrollers/linux-and-rtos/k12-freertos-no-start/) |
