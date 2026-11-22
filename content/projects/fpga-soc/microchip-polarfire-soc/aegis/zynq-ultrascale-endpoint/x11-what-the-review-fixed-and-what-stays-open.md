+++
title = "The Zynq UltraScale+ endpoint after review: what was fixed, what stays open"
date = '2026-11-22T12:00:00+01:00'
draft = false
description = "A review of the Zynq UltraScale+ endpoint and of the network paths to it. The accelerator's DMA could write anywhere as a secure master, so the PL left the boot image. Linux on the board was narrowed. Slow connections could hold the gateway's services; the fixes are tested but not deployed. Two limits stay: partitions after the FSBL are measured, not authenticated, and OP-TEE is built as a development configuration."
weight = 70

[params]
+++

After [lab 66](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a19-the-trusted-application-on-the-sdk/)
the board was admitted with trustzone trust, an endorsed key and a bound session. A review followed: the board's
boot chain, its Linux side, and every network path an unauthenticated host can reach. This page lists what came out
of it that concerns the project's own design. Each item says whether it is fixed, fixed but not deployed, or a known
limit.

## Fixed: the accelerator could write anywhere, as a secure master

The PL held the post-quantum accelerator of
[lab 61](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a14-our-boot-chain-and-the-accelerator/),
a demonstration: the trusted application does not use it. Its DMA engine wrote to whatever address its registers
named, with no window check, and marked its writes as secure. Root on Linux could set those registers. So a
demonstration block was a way for the normal world to write into memory that only the secure world should change.

The fix removes the block instead of filtering it: the boot image no longer carries a bitstream, and Linux can no longer
load one. With an empty PL there is no PL master left. The RTL now has a fixed DMA window and non-secure write
tagging; that version is simulated, not yet built into a bitstream. The quote now carries six measurements instead
of seven, and the board was admitted again under a new endorsement.

## Done: the Linux side of the board, narrowed

On this endpoint Linux only carries the network; the key and the protocol live in OP-TEE. Three steps make a remote
foothold on Linux worth less:

- SSH without forwarding or tunnels, and no password login as root
- the bridge between the network and OP-TEE runs as its own non-root user, sandboxed, with access to the TEE device
  only
- an inbound allowlist: only the bench's own hosts can connect

Each step was applied with a backup and its own undo; the last two undo themselves if the gateway loses the board. Two limits: the allowlist
filters by source address, so a host that takes an allowed address gets through; and it is not yet persistent, so it
has to be applied again after a reboot. Root on the board is still kernel-level code; the boundary that protects
the key is the secure world, not Linux.

## Fixed, not deployed: slow connections held the services

A review of the network surface, with fuzzing of every parser an unauthenticated host can reach (the ZynqMP bridge,
the trusted application's entry point, the Prover SDK core, the verifier's reply parsers), found no memory-safety
bug with inputs inside the protocol. It found an availability problem in three places: the timeouts applied to each
receive, not to the whole request.

| Where | Effect | Fix |
|---|---|---|
| The board's bridge | one byte every few seconds held its only worker for hours | one deadline per request, and a send timeout |
| The gateway's quote service | eight slow clients held every slot | one deadline per request; requests limited to 1 KiB |
| The verifier's reads from endpoints | one slow endpoint, or a host answering in its place, held the whole cycle until the other endpoints' admissions ran out | the timeout covers the whole reply |

The verifier case fails closed: the endpoints go to quarantine, they are not admitted wrongly. Each fix has a test
that fails without it. They are on a branch, not yet on the gateway or the board.

## Known limit: measured, not authenticated

In the boot image only the FSBL and the PMU firmware are encrypted. TF-A, OP-TEE and U-Boot are measured by the FSBL
but not authenticated, so a changed partition still runs. The gateway sees the changed measurement and quarantines
the board: this is detection, not prevention. Turning it into prevention needs authentication enforced by eFUSE
(`RSA_EN` and a key hash), which cannot be undone, and this bench writes no fuse.

## Known limit: a development configuration of OP-TEE

OP-TEE is built with `CFG_INSECURE=y`, its default. It prints a warning at boot and allows OP-TEE's insecure
fall-backs instead of failing. The one that matters here: without a valid key seed from the boot chain, OP-TEE would
use its constant development key. The gateway would see a different key, labelled `development-shared-key`, and
quarantine the board under its policy, but the image itself would not refuse to run. A product build would turn the
option off after replacing or refusing each fall-back.

The full list of limits is in the project's
[threat model](https://github.com/ismailalitech/aegis/blob/main/docs/threat-model.md).
