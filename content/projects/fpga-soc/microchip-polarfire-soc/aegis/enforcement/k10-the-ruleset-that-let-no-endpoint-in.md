+++
title = "The ruleset that let no endpoint in"
date = '2026-11-18T15:45:00+01:00'
draft = false
description = "The enforcement ruleset dropped the replies to the gateway's own connections, so the gateway could never attest an endpoint that was not yet admitted. Nobody would ever have been let in. The test had only ever tried the other direction."
weight = 30

[params]
+++

Found while writing [lab 59](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/a08-one-port-and-a-vlan-switch/),
in the ruleset of [lab 53](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/a07-enforcement-without-a-switch/).

## Symptom

None on the bench, because the ruleset has never sat in a real traffic path. The VLAN test needed the gateway to
attest an endpoint, the way `aegis-fleet` does every cycle, and that check failed.

## Finding it

Lab 53's test checked what an endpoint can open: the network, the gateway's quote port. It never checked the
direction the gateway actually uses: the gateway opens a connection to the endpoint's prover on port 7444. Two
checks were added to the test: the gateway reaches a not-yet-admitted endpoint, and a quarantined one. Both failed:

![Before the fix: the gateway cannot reach the endpoint it must attest, 11 passed and 2 failed; after: attestation works both ways and other gateway ports stay closed, 13 of 13](/aegis/diagrams/console-enforcement-reply-bug.svg)

## Cause

The input chain had one rule for traffic from endpoints that are not admitted:

```text
iifname $ENDPOINT_IF ip saddr != @admitted tcp dport != { 7443 } counter drop
```

It was meant to stop a quarantined endpoint from reaching anything on the gateway but the quote service. But when
the gateway connects to an endpoint, the endpoint's replies come from port 7444 and go to a random port on the
gateway, not 7443, so they were dropped too. The gateway could never get an answer from an endpoint that was not
already admitted:
- a new endpoint would never be admitted;
- a quarantined one would never come back.

## Fix

One rule before it accepts the replies to connections the gateway opened:

```text
iifname $ENDPOINT_IF ct direction reply accept
```

Connections an endpoint opens are in the original direction, so they still go through the drop rule. The added check
"the endpoint reaches another gateway port (SSH)" confirms it.

## Result

13 of 13 with the fix, and the two new checks fail on the old ruleset. The general lesson: test the direction the
system actually uses, not only the one the rule was written for.
