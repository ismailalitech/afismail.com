+++
title = "A gateway that hung for seven hours, and a watchdog nobody was feeding"
date = '2026-11-19T06:35:00+01:00'
draft = false
description = "The PolarFire gateway stopped overnight without an error, and stayed stopped for about seven hours until it was power-cycled. The chip has a hardware watchdog, and systemd had left it off. Now systemd drives it, and a test showed the gateway resetting itself and coming back."
weight = 20

[params]
+++

## Symptom

On the night of 18 to 19 November the gateway stopped. Its journal ends at 22:56 UTC with no error. The only unusual
line earlier was `mpfs_rtc: timed out uploading time to rtc`. For about seven hours nothing attested the endpoints. A
power cycle brought it back.

## Cause

Unknown. The journal is kept on the SD card, and it shows nothing before the stop. One hang is not enough to find it,
and the project does not claim a cause.

## What was missing

Not knowing the cause, the question became why the board did not recover by itself. The chip has a hardware
watchdog (`mpfs_wdt`, 28 s, `nowayout`: once opened it cannot be stopped). systemd can feed it and let it reset the
board when systemd itself or the kernel stops. On this image systemd had it switched off.

## Fix

A drop-in, `/etc/systemd/system.conf.d/aegis-watchdog.conf`:

```ini
[Manager]
RuntimeWatchdogSec=20s
RebootWatchdogSec=25s
```

`RuntimeWatchdogSec` makes systemd open the hardware watchdog and feed it while it runs. `RebootWatchdogSec`
limits a reboot that itself hangs to 25 s.

## Test

For one boot systemd was made to let go of the watchdog without feeding it. The gateway reset itself after 25 s and
came back with its services.

## What it does and does not cover

- It covers a hang of the kernel or of systemd itself: the watchdog is no longer fed and the board resets.
- It does not cover a service that stops working while the system runs. systemd keeps feeding the hardware watchdog
  then. A hung `aegis-fleet` with a healthy system is not caught by this change.
- It does not explain the hang of 18 November.

## Undo

Delete the drop-in and run `systemctl daemon-reexec`. Because of `nowayout`, the watchdog keeps running once it has
been opened.

## What it means for you

- A device that makes decisions for others should restart itself when it hangs. Check that the hardware watchdog is
  really being fed, not only that the driver is loaded.
- Test the watchdog by letting it expire once, on the bench, and watch the board come back.
