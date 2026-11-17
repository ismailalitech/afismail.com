+++
title = "Test the enforcement rules without a switch, and find what they let through"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "Three network namespaces stand in for the gateway, an endpoint and the network. The real ruleset and hook run in them, and the first run found that quarantine did not cut a connection that was already open."
weight = 10

[params]
  lab = 53
  board = "Development PC (the rules are for the PolarFire gateway)"
  core = "Linux network stack"
  level = "Intermediate"
+++

After this lab you can check a zero-trust ruleset on one PC with no second network card and no switch, you know what the gateway's rules do and do not guarantee, and you have seen a defect that a syntax check could never find.

## Before you start

- A Linux PC with `nft` (nftables), `ip` (iproute2) and Python 3, and root access. The test creates three network namespaces and removes them when it ends. It does not touch the PC's own network or firewall.
- The Aegis repository checked out ([lab 47](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/a01-reproduce-the-bench/)).
- **This lab does not enforce anything on the real gateway.** That needs a managed switch; see the limits below.

## The idea

The gateway already decides: admitted or quarantined, every cycle. Enforcement makes the decision matter, by blocking an endpoint's traffic until it is admitted.

![The enforcement path: an endpoint's traffic reaches the gateway's forward chain, which accepts it only while the endpoint's address is in the admitted set; aegis-fleet fills the set after each verdict](/aegis/diagrams/enforcement-path.svg)

The rules (`gateway/enforce/aegis.nft`) are small:

- the forward chain has policy **drop**;
- traffic to or from an endpoint segment is accepted only while the endpoint's address is in the `@admitted` set;
- everything else from that segment is logged and dropped;
- a quarantined endpoint can still reach the gateway's quote port and get an address by DHCP, so it can be attested and re-admitted.

After every verdict, `aegis-fleet` calls the hook `aegis-enforce.sh <endpoint> admit|quarantine`, which adds the address to the set or removes it. The address is read from the policy file.

## Why a test without a switch works

What the rules do depends only on the Linux forwarding path, not on the physical wires. So the test builds the same shape in software:

| Namespace | Plays | Address |
|---|---|---|
| `aegis-gw` | the gateway, forwarding enabled, running the real ruleset and hook | 10.77.1.1 and 10.77.2.1 |
| `aegis-ep` | an endpoint | 10.77.1.2 |
| `aegis-lan` | the rest of the network, with a web server | 10.77.2.2 |

The gateway namespace has two virtual links, one to each of the others, exactly as a gateway with an endpoint segment and a network side would.

## Run it

```sh
sudo tests/host/test_enforcement.sh
```

It ends with `passed N, failed M`. The sequence:

1. An endpoint that has not attested: ping and TCP to the network must be **blocked**; TCP to the gateway's quote port must be **allowed**.
2. Admit it with the real hook: ping and TCP must be **allowed**.
3. Start a long-lived connection (one byte every 0.2 s), quarantine the endpoint, and check that the connection stops delivering within one second.
4. Quarantined again: new TCP and ping **blocked**, the quote port still **allowed**.
5. Re-admit: TCP **allowed** again.

## The first run found a defect

| Check | Result |
|---|---|
| Not attested: ping, TCP to the network | blocked |
| Not attested: TCP to the quote port | allowed |
| Admitted: ping, TCP | allowed |
| **Quarantine: the open connection stops within 1 s** | **fail: it kept delivering 16 bytes after more than a second** |
| Quarantined: new TCP, ping | blocked |
| Quarantined: quote port | allowed |
| Re-admitted: TCP | allowed |

New connections were blocked, and an open one lived on. The cause was the first line of the forward chain, a blanket rule that accepted every packet of an established connection:

```text
ct state established,related accept
```

Connection tracking remembers a flow once it was allowed, and this rule let every later packet of that flow through whether or not the endpoint was still admitted. Quarantine therefore only stopped *new* flows. A device that had been compromised after its last good attestation could keep a connection that it had opened while admitted.

## The fix

Accept each direction only for an admitted address, for new and established packets alike:

```text
iifname $ENDPOINT_IF ip saddr @admitted accept
oifname $ENDPOINT_IF ip daddr @admitted accept
```

With that, removing the address from the set stops traffic in both directions on the next packet, whatever the connection's state. The rerun:

| Run | Passed | Failed |
|---|---|---|
| Original rules | 9 | 1 |
| Fixed rules | 10 | 0 |

The test also runs in GitHub Actions on every push, so the property is checked on a clean machine.

## What this does and does not show

- It shows that the ruleset implements its policy: blocked until admitted, cut when quarantined, the quote port always reachable.
- It does **not** show that the real gateway is in a position to enforce. The Discovery Kit has one Ethernet port. The processor's USB controller is not routed to a connector, and the USB-C port goes to the debug chip, so a second network port cannot be added with an adapter.
- Real separation therefore needs a managed switch with 802.1Q VLANs: one VLAN per endpoint, the gateway as the only router between them. Without one, a routed subnet is possible, but a compromised endpoint on the same Ethernet segment as other devices can bypass it.
- The gateway's kernel must have packet filtering. The one the board runs does; see [the kernel install](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/k05-a-kernel-install-that-replaced-lib/).

## What to check

- Run the test twice; it should end with all checks passed and leave no namespaces (`ip netns list` prints nothing).
- Edit `aegis.nft` to put back the established rule and confirm the test fails on the open-connection check.

## Where it can go wrong

- Running the test without root: `ip netns` needs it.
- A test connection that hangs for a long time: check that the Python web servers in the namespaces started; port 8080 and 7443 must be free in them.
- Believing a passing test means the bench is protected. It does not, until the gateway is in the traffic path.
