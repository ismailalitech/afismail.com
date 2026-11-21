+++
title = "Aegis architecture explorer"
description = "Every component and connection of the Aegis post-quantum attestation gateway and its endpoints: select a block or a line, play the protocol step by step, or replay the verdicts the gateway recorded."
weight = 70

[params]
  topics = ["Tool"]
  toc = true
+++

An interactive map of the [Aegis gateway](/projects/fpga-soc/microchip-polarfire-soc/aegis/) and the four boards it
attests, as built on 21 November 2026, at the releases 1.0 and 1.1, with Aegis 1.2 on the gateway. Select a box to see what it does, what it talks to, which labs explain it and
which files in the repository back it. Select a line to see what it carries. Eleven walks play the protocol one step at
a time, and a replay tab steps through verdict lines the gateway recorded on the bench. It runs in the browser and
sends nothing.

**[Open the explorer](/aegis/explorer/)**

## What it shows

- **System and protocols.** The PC verifier, the PolarFire gateway (aegisd, aegis-fleet, the policy, the identity
  key, the system controller, the fabric accelerator and the enforcement hook), the bench LAN, and the endpoints:
  two STM32H573 boards with their TF-M partition, the NXP RW612 with its TF-M partition, the Zynq UltraScale+ with its
  trusted application in OP-TEE, and the Arduino Uno behind a relay.
- **Inside the endpoints.** For each endpoint with a secure world, what runs on each side of the boundary, where the
  key comes from (the DHUK in SAES, the die key in ELS, the PUF's black key), which clock ends a session, and what is
  measured and by whom.
- **Evidence and records.** The signed objects around the verdicts and who makes them: the Prover SDK core in the
  three secure worlds, standard evidence from STM32 board 2, the gateway's signed attestation results and audit log
  (since 1.2 each result names the log's head, and the pack's manifest and export time are signed), the signed policy
  with the trust floor and the switch of 1.2, and on the PC the endorser, the policy signer with its TPM-sealed key, the audit anchors and the
  standalone checkers.
- **Connections.** The gateway quote, attestation (`PQCHAL`, `PQTOKEN`), ML-KEM provisioning (`PQKEMINIT`,
  `PQKEMFIN`), KMAC heartbeats (`PQHB`), calls between the worlds, boot hand-overs, key material, measurements and the
  enforcement hook, and signed records, each drawn differently.
- **Walks.** One attestation cycle from nonce to verdict; ML-KEM provisioning with mutual authentication; a heartbeat;
  a tampered image quarantined and its credential revoked; a credential that expires on the endpoint; the Zynq
  UltraScale+ secure boot from the PUF to the trusted application's key; the gateway proving itself to the PC;
  standard evidence from STM32 board 2 to a checker; a signed policy, the audit log and an anchor; an endorsed key
  and a substituted one; and Aegis 1.2 on the bench: a floor STM32 board 2 can never meet, the board disabled, a floor
  it meets, and a pack with a signed export time.
- **Fleet replay.** Eight short recordings of the gateway's verdict lines, from the repository's evidence files. Each
  step replays one line and updates a table of the devices: kind, trust label, last verdict, heartbeat counter, the
  secure partition's stack high-water mark and the seconds the session has left. It is a replay of what was recorded,
  not a live view.

## Where the data comes from

Everything on the map comes from one file, [`architecture.yaml`](/aegis/architecture.yaml), written from the
documents and evidence in the [Aegis repository](https://github.com/ismailalitech/aegis): `docs/architecture.md`,
`docs/threat-model.md`, `docs/zynqmp-key-design.md`, `docs/endpoint-expiry.md`, `docs/evidence-format.md`,
`docs/audit-and-policy.md`, `docs/enrolment.md`, `docs/zynqmp-sdk-port.md`, the release notes, the endpoint READMEs
and `evidence/`.
The site reads it when it is built; a lab it names that does not exist stops the build. The replayed lines are copied
from the evidence files as they are, with the LAN addresses already masked there.

## Related

- [Aegis results and evidence](/resources/aegis-results/): every check, its method, its result and its record.
- [How attestation works](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/): the terms the explorer uses.
- [The threat model](https://github.com/ismailalitech/aegis/blob/main/docs/threat-model.md): what is and is not
  protected.
