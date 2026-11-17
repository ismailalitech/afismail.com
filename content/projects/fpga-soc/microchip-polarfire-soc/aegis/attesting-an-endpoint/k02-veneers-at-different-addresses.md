+++
title = "A non-secure app that faulted on its first secure call"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "The installed secure image could not be reproduced locally, its secure-gateway veneers sat at other addresses, and an application built against the local build crashed. The fix was to install a matching pair."
weight = 40

[params]
+++

The endpoint already ran TF-M when the project started: a boot loader, a secure image and a small non-secure test application. The plan was to build the project's prover application and flash it next to the existing secure image. It faulted at the first call into the secure world.

## Symptom

The prover started, printed its banner, and faulted the first time it called a secure service. It had been linked against a local build of TF-M; the secure image on the board was not that build.

## Isolation

The application calls the secure world through *secure-gateway veneers*, small entry points in a fixed region that the secure image exports. A non-secure image is linked against the addresses of those veneers taken from the secure build it was made for. So the first thing to compare was where the veneers were:

| Secure image | Veneers |
|---|---|
| Installed on the board (the TF-M that Zephyr ships, commit 47b9f07b9) | `0x0C085F00` to `0x0C085F40` |
| Built locally from upstream TF-M v2.3.0 | `0x0C085FC0` to `0x0C085FE0` |

They differ. The application linked against the local build called addresses that, in the installed image, held something else.

The installed image could not be reproduced from a local build, so the addresses could not be made to match.

## Cause

A non-secure image and a secure image form a pair. Their link-time contract is the veneer table, and it depends on the exact secure build, not only on its configuration. Mixing a non-secure image from one build with a secure image from another is a fault waiting for its first secure call.

## Fix

Install the matching pair together: the upstream TF-M v2.3.0 secure image with the Aegis partition, and the Aegis prover linked against that same build. The security counter stayed at 1 on every image, so rollback protection was not touched, and the boot loader, option bytes and product state were left as they were. The original firmware was backed up first and the restore was tested.

## A second trap in the same area

The non-secure image is signed as part of its build, and that signing step does not rerun on an incremental build. A change to the source could therefore leave an old signed image in place. The prover's build script now always builds from clean and checks that the banner string is inside the signed image.

## What it means for you

- Treat the secure and non-secure images as one release. Rebuild both when either changes, and flash both.
- Keep the veneer addresses in your build log. A fault on the first secure call, after a change that did not touch the application, is almost always a mismatch of this kind.
- Back up all of the board's flash, in both security views, before the first write.
