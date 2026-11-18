+++
title = "A second chip family: an NXP RW612 endpoint with a key from ELS"
date = '2026-11-18T00:30:00+01:00'
draft = false
description = "Bring an NXP FRDM-RW612 into the fleet: back up its factory firmware, prove its Ethernet, derive an ML-DSA-65 key from the die key inside the chip's EdgeLock Secure Subsystem, run the same attestation protocol under Zephyr, and watch the gateway admit it, quarantine a modified image and admit it again."
weight = 36

[params]
  lab = 57
  board = "NXP FRDM-RW612, PolarFire SoC Discovery Kit"
  core = "Cortex-M33 (Zephyr), U54 (Linux)"
  level = "Advanced"
+++

After this lab a microcontroller from a second vendor is an attested endpoint: it holds an ML-DSA-65 key that only
its chip can produce, answers the gateway's challenges, accepts an ML-KEM-768 credential and keeps a session alive with
KMAC heartbeats. You will also see exactly how much its evidence proves, because it proves less than the STM32 and the
gateway's verdict says so.

## Before you start

- [Lab 50](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a04-attest-the-stm32/) working: the
  gateway's `aegis-fleet` service attests endpoints every cycle.
- An NXP FRDM-RW612, an Ethernet cable to the bench network, and a USB-C **data** cable straight into the PC (see
  [Where it can go wrong](#where-it-can-go-wrong)).
- On the PC: the SEGGER J-Link software (the board's on-board MCU-Link runs J-Link firmware), a Zephyr v4.5.0
  workspace with the `hal_nxp`, `cmsis` and `cmsis_6` modules, the Zephyr SDK 1.0.1 (the minimal bundle and the
  `arm-zephyr-eabi` toolchain), and mldsa-native and mlkem-native v2.0.0.
- The project repository: the prover is in `endpoints/rw612/`.

## The board

The RW612 is a Cortex-M33 at 260 MHz with TrustZone, Wi-Fi 6 and Bluetooth LE radios, and NXP's EdgeLock Secure
Subsystem (ELS), a crypto block with its own key store. The FRDM board adds 64 MB of external flash, a 100 Mb/s
Ethernet port with a KSZ8081 PHY, and an MCU-Link debug probe on USB that also carries the console. It came with NXP's
Wi-Fi command-line demo (WLAN driver v1.3.r48.p16, Wi-Fi firmware 18.99.6.p12).

## The idea

Run the same protocol as the STM32, and take the key from the chip. ELS holds a **die master key** in key slots 0 and 1:
the boot ROM loads it from the chip's PUF at every reset, it is marked device-unique, and software can use it for key
derivation but never read it. The prover asks ELS to derive a temporary key from it (CKDF, NIST SP 800-108), then two
HMAC-SHA256 values with that temporary key, one per label, and deletes the temporary key. The first value seeds the
ML-DSA-65 key; the second is the root for every ML-KEM-768 exchange.

![How the RW612 endpoint's keys are made inside ELS: the die master key derives a temporary HMAC key with CKDF; two HMAC values from it seed the ML-DSA-65 key and the provisioning root; the temporary key is deleted](/aegis/diagrams/rw612-key-derivation.svg)

The same chip gives the same key on every boot, another chip gives another key, and no secret is stored in flash.

The rest of the firmware is small. Zephyr brings up the Ethernet port and a TCP server on port 7444. The protocol code,
`aegis_proto.c`, has no RTOS code in it: it builds the claims, signs them, runs the ML-KEM exchange, checks the
gateway's credential and computes the heartbeat, with mldsa-native, mlkem-native and the KMAC code that the STM32's
secure partition uses, in the same configuration. Because it has no RTOS code, the PC tests build the very same file.

![The RW612 endpoint and the gateway: the gateway's fleet service pins the key and allows one image hash; on the board, Zephyr networking, the protocol code, the shared PQ libraries, and under them ELS, the TRNG and the image in flash](/aegis/diagrams/rw612-endpoint.svg)

### What it proves, and what it does not

The key proves **the chip**: a quote signed with the enrolled key comes from this RW612 and no other. The image
measurement (`APP`, the SHA-256 of the firmware as it sits in flash) is computed **by the firmware itself**. A
modified firmware that wanted to lie could report the good hash, because ELS gives the same derived secret to any code
running on this chip. On the STM32 the boot loader measures the images and the key lives in the secure side, so a
modified non-secure image cannot do that.

So the gateway gets a new endpoint kind, `aegis-device`, and its verdict carries the label **device-key trust**:
between the STM32 (no label) and a Linux board whose key is a file (software trust).

![Three kinds of endpoint: the STM32 keeps its key in the secure side and its boot loader measures; the RW612 keeps its key in ELS but measures itself, device-key trust; a Linux board keeps its key in a file and measures itself, software trust](/aegis/diagrams/endpoint-trust-levels.svg)

## Run it

### 1. Back up the factory firmware

Connect the board's MCU-Link port and check that it is seen: `lsusb` shows `1366:1024 SEGGER J-Link`, and a serial
port appears. The first time each day, J-Link shows SEGGER's terms of use for the MCU-Link firmware on the PC's
screen; nothing connects until they are accepted. Then read the external flash, mapped at `0x08000000`:

```sh
JLinkExe -device RW612 -if SWD -speed 4000 -autoconnect 1 -CommandFile dump.jlink
# dump.jlink:  savebin frdm-rw612-flash-16M.bin 0x08000000 0x1000000
#              exit
sha256sum frdm-rw612-flash-16M.bin > SHA256SUMS
```

The demo uses three regions of the first 16 MB (`0x08000000-0x08070000`, `0x08400000-0x08490000` and
`0x085E0000-0x08630000`); the rest of those 16 MB is erased, and nothing in this lab writes beyond the first region.
Writing the backup back with J-Link's `loadbin` is the way back; it was not needed here, so it is not tested.

### 2. Prove the Ethernet port first

Before any security code, build Zephyr's own DHCP sample and flash it:

```sh
west build -b frdm_rw612 -d build/dhcp zephyr/samples/net/dhcpv4_client
west flash -d build/dhcp -r jlink
```

The console shows the PHY negotiating `100 Mb, full duplex` and an address from the DHCP server, and the board answers
`ping`. A problem found later is then not the network.

### 3. Build and flash the prover

```sh
endpoints/rw612/build.sh flash
```

The image is 146,308 bytes of flash and about 207 KiB of RAM, and it rebuilds bit for bit:
`sha256 864ac72280f7200b...` both times. On the console:

![The FRDM-RW612 console after a reset: Zephyr starts the prover, which lists the ELS key slots, derives its key, hashes its image, sets a MAC from the key, brings the link up and listens on port 7444](/aegis/diagrams/console-rw612-boot.svg)

The key fingerprint (`219414c54e7bbf34...`) stays the same across resets and across two different images. The MAC
address is `02:ae` and the first four bytes of the public key, as on the STM32 endpoints, so each chip gets its own.

### 4. Check it from the PC

Before the gateway sees it, run the gateway's own verifier code against the board from the PC: fetch the key with
`PQKEY`, then ask for quotes.

![From the PC with the gateway's verifier: the key fingerprint, twenty attestations admitted in 73 to 302 ms, the measurement equal to the hash of the built image, and a wrong reference refused](/aegis/diagrams/console-rw612-pc.svg)

Each quote is a fresh, hedged ML-DSA-65 signature on the Cortex-M33 (32 bytes from the hardware TRNG in every one),
plus the network.

The PC tests go further without the board: they build `aegis_proto.c` for the PC, start it as a server and run the
gateway's attestation, provisioning and heartbeat code against it, together with forged credentials, a credential for
another exchange or another device, and malformed requests.

[![A real screenshot: the seven PC tests of the RW612 protocol code, all passing](/aegis/rw612/rw612-pc-tests.png)](/aegis/rw612/rw612-pc-tests.png "Open the screenshot at full size")

### 5. Add it to the gateway

Copy the key the board reported to the gateway (trust on first use, as `fleet.py enroll-pq` does) and add an entry to
the policy, with the image hash computed on the PC from the `zephyr.bin` that was flashed:

```json
{"name": "frdm-rw612", "kind": "aegis-device", "host": "<board address>", "port": 7444,
 "pq_pub_file": "keys/frdm-rw612.mldsa65.pub",
 "allowed": [{"type": "APP", "measurement_value": "<sha256 of zephyr.bin>"}],
 "provision": true, "heartbeat_mac": "kmac256"}
```

Restart `aegis-fleet`. In the first cycle the board is admitted with device-key trust and receives a credential: the
gateway signs it with its identity key, the board checks it against the gateway key pinned in its image, finishes the
ML-KEM-768 exchange and answers with a confirmation tag. From the next cycle on, KMAC256 heartbeats verify.

### 6. Flash a modified image

Rebuild the same prover with one configuration value changed (`CONFIG_NET_HOSTNAME`), flash it, wait two cycles, and
flash the good image again. The recording shows it live, at four times the real speed: the gateway journal on top,
the board console bottom left, the steps bottom right.

{{< clip src="/aegis/rw612/rw612-tamper-demo.mp4" poster="/aegis/rw612/rw612-tamper-demo-poster.webp" width="1600" height="830" label="Screen recording of the RW612 tamper demo" caption="Screen recording (4x speed, 60 s, no sound): the good image is admitted with heartbeats; the modified image boots with the same key and another image hash and is quarantined with its credential revoked; the good image is admitted again with a new session." >}}

[![A real screenshot from the recording: the modified image has booted with the same key and another image hash, and the gateway has quarantined it](/aegis/rw612/rw612-demo-quarantined.png)](/aegis/rw612/rw612-demo-quarantined.png "Open the screenshot at full size")

[![A real screenshot at the end of the recording: both boots in the console, and the gateway admitting the good image again with a new session and heartbeats](/aegis/rw612/rw612-demo-readmitted.png)](/aegis/rw612/rw612-demo-readmitted.png "Open the screenshot at full size")

The journal of a first run, with the callouts:

![The gateway journal: admitted with a credential and heartbeats; three cycles quarantined with the modified image, credential revoked; admitted again with a new session and heartbeats](/aegis/diagrams/console-rw612-gateway.svg)

## What it shows

| Check | Result |
|---|---|
| Key across resets and two images | the same, `sha256 219414c5...` |
| Image measurement | equal to `sha256sum zephyr.bin` (146,308 bytes) |
| 20 attestations in a row from the PC | 20 admitted, 73 to 302 ms each |
| Gateway, good image | admitted (device-key trust), credential issued, heartbeats verify |
| Gateway, modified image | quarantined: `component APP not allowed`, credential revoked |
| Gateway, good image again | admitted, new session, heartbeats from 1 |
| PC tests of the protocol code | 7 of 7 |
| Rebuild of the image | bit-identical |

The modified image still signs validly: the key belongs to the chip, not to the image. It is caught by the
measurement, and only because this firmware reports its own hash honestly.

## What to check

- The console prints `els slot 0: props 0x60010161` and `els slot 1: props 0x60010121` (the die master key) before
  the key line, and the key fingerprint is the same after every reset.
- The `APP` value in a quote equals `sha256sum` of the `zephyr.bin` you flashed.
- The gateway journal shows `ADMITTED (device-key trust)` and, one cycle later, a heartbeat.

## Where it can go wrong

- **The cable.** A charge-only USB-C cable shows nothing at all; a weak one makes the MCU-Link drop off the bus
  (`device descriptor read/64, error -71`) or reboot as soon as it powers the debug port, so every connection hangs.
  Use a data cable straight into the PC.
- **The terms dialog.** Until SEGGER's terms for the MCU-Link firmware are accepted on screen, J-Link waits without an
  error. On a headless machine, run it once at the desktop.
- **A 256-bit ELS key takes two slots.** The first version put the temporary key in slot 19 and the board reset in a
  loop, silently. The whole story is in
  [an ELS key in the last slot reset the chip](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k06-an-els-key-in-the-last-slot/).
- **ELS is already on.** The boot ROM enables it; the prover does not call `mcuxClEls_Enable_Async()`, which writes the
  whole control register.
- **Connection contexts.** Every closed TCP connection keeps its context through TIME_WAIT, and a provisioning makes
  three connections in a row. With Zephyr's defaults the second attestation in a row was refused (`Not enough
  connection contexts`); `CONFIG_NET_MAX_CONN=24` fixes it.

## What would make it stronger

Done in [lab 58](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a12-trustzone-on-the-rw612/):
the prover moved into a TF-M secure partition, with the peripherals closed that would have undermined it.

Move the prover into the TrustZone secure side (TF-M exists for the RW612 in NXP's Zephyr tree) and let a measured boot
stage hand the secure side the image hash, so a modified non-secure image could neither use the key freely nor report
a false measurement. With secure boot fused on, the ROM would also check that first stage. Neither is done here: no fuse
or OTP word of this board was written.
