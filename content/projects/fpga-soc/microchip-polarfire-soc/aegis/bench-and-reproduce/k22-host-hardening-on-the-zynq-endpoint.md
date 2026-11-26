+++
title = "Host hardening on the Zynq endpoint: three steps, each with an undo"
date = '2026-11-26T09:30:00+01:00'
draft = false
description = "On the Zynq UltraScale+ endpoint Linux only carries the network: the key is in OP-TEE. Three steps make the Linux side smaller: an sshd drop-in, the bridge as a sandboxed user that is not root, and a firewall that lets three hosts in. The firewall is not persistent. A restart clears it, and it is applied again by hand behind a five-minute automatic flush that has to be cancelled on purpose. What each step does, how each is undone, and what none of them changes."
weight = 90

[params]
+++

On this board Linux does not hold the key.
[OP-TEE does](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a15-optee-holds-the-key/),
and a small bridge on Linux passes lines between TCP port 7444 and the TEE device. Linux is still the part that
faces the network. On 22 November 2026 three steps made that part smaller.

None of them touches the card's boot partition, and the root file system is not measured. So no measurement, no
endorsement and no policy version changed.

## How each step was run

One step at a time, from the bench PC over SSH, each with the same shape:

1. **Check first:** a fresh SSH login, port 7444 reachable from the PC, the board admitted by the gateway.
2. **Back up** every file the step changes, on the board and on the PC.
3. **Apply.**
4. **Check again,** the same three checks. Steps 2 and 3 wait one gateway cycle, 75 seconds, so that the
   gateway has attested the board through the changed setup. They undo themselves if the bridge or the gateway
   check fails.

The board's kernel shaped the steps. It has no nf_tables, so the firewall uses legacy iptables. It has no cgroup
BPF, so systemd's own address and device filters are not available.

## Step 1: sshd

One drop-in file in `/etc/ssh/sshd_config.d/`:

```
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
PermitTunnel no
PermitRootLogin prohibit-password
MaxStartups 4:50:10
LoginGraceTime 20
```

`sshd -t` checks the configuration before the reload. If the check fails, the file is removed and nothing is
reloaded. Key logins work as before. Password logins as root do not.

**Undo:** remove the file, check, reload.

## Step 2: the bridge is not root

The bridge ran as root. It only needs a TCP socket and the TEE device.

- A system user `aegis-bridge`, with no home and no login shell, and a group `tee`.
- A udev rule that gives the TEE client device to that group:

  ```
  KERNEL=="tee[0-9]*", GROUP="tee", MODE="0660"
  ```

  The supplicant's device stays root-only.
- A drop-in for the bridge's unit: the new user, the `tee` group, `NoNewPrivileges`, `ProtectSystem=strict`,
  `ProtectHome`, `PrivateTmp`, no capabilities, no new namespaces, and only the IP and Unix address families.

After the restart the bridge runs as `aegis-bridge`, the port answers, and the gateway admitted the board through
it one cycle later.

**Undo:** remove the drop-in and the udev rule, reload both, restart the bridge. The user and the group stay.

Four days later the bridge binary itself was replaced by a static one
([the review fixes](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k18-the-review-fixes-on-the-bench/)).
The sandbox is in the unit's drop-in, not in the binary, so it applies to the new one too.

## Step 3: an allowlist that is not persistent

Inbound IPv4 is dropped, except:

- loopback, and packets of connections that already exist;
- ICMP, and DHCP replies;
- SSH and port 7444 from three hosts: the PC, the gateway and one second workstation.

On IPv6 only loopback, existing connections and ICMPv6 pass. Outbound traffic is not filtered.

**The safety window.** A wrong rule could lock the bench out of a board whose only other way in is the serial
console. So before any rule is loaded, a timer is armed that opens the firewall again after 300 seconds:

```
systemd-run --unit=aegis-fw-rollback --on-active=300 /usr/local/sbin/aegis-fw-flush
```

Then the rules are loaded and the checks run: a fresh SSH login, the port from the PC, one gateway cycle through
the firewall. Only when all of them pass is the timer stopped. That is a separate command, `confirm`. Without it
the rules flush themselves. If loading the rules fails, they are flushed at once.

**Not persistent, on purpose.** The rules are not saved. A restart or a power cycle clears them, and that is the
last way back in. After every boot the same script is run again: arm, load, check, confirm, with the same three
hosts.

This has a cost, and it has already shown. The firewall was gone after the
[OP-TEE change](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k21-op-tee-4-7-to-4-11-on-the-zynq-endpoint/)
and after later restarts, and was applied and confirmed again by hand. Between a boot and that command the
board has no firewall. Nothing on the bench reminds anyone to run it.

**Undo:** run the flush script and stop the timer.

## What this does not change

- **Root is still root.** The kernel loads unsigned modules, so a root process can become kernel code. These
  steps make root harder to reach: fewer SSH features, a bridge that is not root, fewer hosts that can connect.
  They do nothing once someone is there. The boundary that protects the key is TF-A and OP-TEE.
- **The allowlist is by source address.** A host on the same network that takes an allowed address gets through.
- **None of it is attested.** The gateway does not see whether these steps are in place. A board with no
  firewall is admitted exactly like one with it.
- **One board, one bench.** The steps were run on the one Zynq UltraScale+ board here, with this kernel.

## Lesson

The auto-flush was armed before the rules, not after, and cancelling it is its own command. A firewall change on
a remote board is safe to try when doing nothing leads back to an open door. The same choice makes the firewall
weaker as a control: it depends on someone running a script after every boot, and the page says so.
