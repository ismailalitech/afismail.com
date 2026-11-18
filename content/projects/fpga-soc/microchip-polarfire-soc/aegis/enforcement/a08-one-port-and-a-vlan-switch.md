+++
title = "One gateway port and a VLAN switch: the design, tested in network namespaces"
date = '2026-11-18T15:40:00+01:00'
draft = false
description = "How a gateway with a single Ethernet port can still stand between the endpoints and the network: a VLAN for the endpoints, the gateway as their only router. A VLAN-filtering bridge plays the switch, the gateway's real setup script and ruleset run unchanged, and the test tries the ways around a VLAN."
weight = 15

[params]
  lab = 59
  board = "Development PC (the setup is for the PolarFire gateway)"
  core = "Linux network stack: bridge with VLAN filtering, 802.1Q, nftables"
  level = "Intermediate"
+++

[Lab 53](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/a07-enforcement-without-a-switch/) showed that
the ruleset does what it says, and that the gateway is not in a position to enforce it: the Discovery Kit has one
Ethernet port. This lab shows how one port can be enough with a switch that does 802.1Q VLANs, and tests the whole
design on one PC. On the bench it is **not applied**: the switch there is unmanaged, so this stays a tested design.

## Before you start

- A Linux PC with `ip`, `bridge` (iproute2), `nft` and Python 3, and root access. The test creates five network
  namespaces and removes them when it ends. It does not touch the PC's own network or firewall.
- The Aegis repository ([lab 47](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/a01-reproduce-the-bench/)).

## The design

![The endpoints are on VLAN 20, the router and PC on VLAN 1; the gateway's one port carries both, VLAN 20 tagged; the gateway routes and masquerades between them and enforces the ruleset on its VLAN 20 interface](/aegis/diagrams/enforcement-vlan.svg)

- **Endpoint ports** are untagged members of VLAN 20 only. Whatever an endpoint sends stays on VLAN 20.
- **The gateway's port** carries the LAN untagged and VLAN 20 tagged. On the gateway, `end0.20` is the endpoint
  side.
- **The gateway routes** between `end0.20` and the LAN, masquerades, and runs the same `aegis.nft` as lab 53 on
  `end0.20`.

An endpoint can then reach anything only through the gateway, and only while admitted.
`gateway/enforce/vlan-setup.sh up end0 20 10.20.0.1/24` sets all of that up on the gateway, optionally with a DHCP
server and fixed addresses per endpoint, and `vlan-setup.sh down` removes everything it made.

## Run it

```sh
sudo tests/host/test_enforcement_vlan.sh
```

| Namespace | Plays |
|---|---|
| `av-sw` | the switch: a Linux bridge with VLAN filtering, ports set as above |
| `av-gw` | the gateway, running `vlan-setup.sh` and the ruleset unchanged |
| `av-ep`, `av-ep2` | two endpoints on VLAN 20 |
| `av-lan` | the LAN, with a web server and no route back to the endpoints |

![The test output: not attested, admitted, quarantined, the ways around the VLAN, the two known limits and the undo, 16 of 16](/aegis/diagrams/console-enforcement-vlan.svg)

## What the test tries

**Admission:**
- An endpoint that has not attested reaches only the gateway's quote port, and the gateway can attest it.
- Admitted, it reaches the LAN, masqueraded.
- The second endpoint, never attested, still cannot.
- Quarantined, the first is cut off again, and the gateway still attests it.

**The ways around a VLAN**, the point of the design. All three are blocked:
- an endpoint that gives itself a LAN address and talks to the LAN host directly;
- an endpoint that tags its own frames for VLAN 1;
- a LAN host that tries to reach an endpoint directly.

**Two known limits**, checked so that they behave exactly as the threat model states:
- Endpoints on the same VLAN see each other past the gateway. Closing that needs the switch's port isolation.
- A device that takes the address of an admitted endpoint that has gone away passes until the gateway's next cycle.
  That cycle attests the address, gets no valid quote and quarantines it.

## What writing it found

The test runs the gateway's real attestation direction: the gateway opens a connection to the endpoint. That
direction had never been tested, and it did not work under the ruleset:
[the ruleset that let no endpoint in](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/k10-the-ruleset-that-let-no-endpoint-in/).

The test's first run also failed its own known-limit check: the two endpoints could not see each other. The cause was
on the PC, not in the design. This PC's systemd derives a virtual interface's MAC address from its name, both
endpoint interfaces were called `e0`, and two identical MACs confuse a switch. The test now gives every port its own
MAC.

## What this does and does not show

- It shows that the design closes the gap lab 53 left: with the switch set up so, an endpoint has no way to the
  network but through the gateway, and no way through it unless admitted.
- It does not show it on the bench. That needs a switch with 802.1Q VLANs, and the bench's switch is unmanaged.

## Where it can go wrong

- **An unmanaged switch:** it passes VLAN tags along but cannot assign a port to a VLAN, so every port sees every
  other and an endpoint can skip the gateway.
- **The gateway's port left untagged on VLAN 20**, or an endpoint port left in VLAN 1: the switch then joins the two
  sides itself.
- **Endpoint addresses in the policy:** they must be the VLAN addresses, fixed by DHCP leases, or the hook admits the
  wrong one.
