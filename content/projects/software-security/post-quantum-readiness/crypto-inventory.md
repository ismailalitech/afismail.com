+++
title = "A cryptography inventory with post-quantum migration planning"
description = "A platform that finds the cryptography an organisation uses, keeps one catalogue of it, checks it against policy, ranks the weak spots and plans the move to post-quantum algorithms. Attested device evidence from the Aegis project is one of its inputs."
date = '2026-11-21T20:00:00+01:00'
draft = false
weight = 30

[params]
  project = true
  platform = "Python, Rego, Docker test services, Aegis evidence packs"
  status = "In progress, code not public yet"
  problem = "Companies use cryptography in websites, servers, certificates, keys and devices, and rarely have a list of where it is, which algorithms it uses and which are weak. Quantum computers will break much of it, and the list is needed before anything can be upgraded."
  role = "Designed and built it: the data model, the collectors, the policy checks, the risk score, the migration planner, the connector for Aegis evidence and the dashboard."
  result = "One catalogue in the CycloneDX 1.6 format, filled from scans, imports and attested device evidence, checked by 23 policy tests and ranked by an explained risk score. All eleven weaknesses planted in a test estate were found."
  hardware = "A Linux PC for the platform; the Aegis bench as a read-only source of device evidence"
  tools = "Python 3.12, SQLAlchemy, Pydantic, Open Policy Agent (Rego), CycloneDX 1.6, Docker (nginx, OpenSSH, step-ca, Vault, LocalStack), Next.js"
  toc = true
+++

## Problem

Cryptography is spread over websites, servers, applications, cloud services, certificates, keys and embedded devices. Few organisations can say where all of it is, who owns it, or which parts use algorithms that are already weak. Quantum computers add a second problem: public-key algorithms such as RSA and elliptic curves will be broken by them, and data with a long life is at risk today, because it can be recorded now and decrypted later. Nothing can be migrated until the list exists.

The project is a map and health check of all the locks in a building: which are weak, which a future tool will open, and in what order to replace them.

## My role

I designed it and built it with Claude Code agents doing the routine implementation, under a written plan and architecture decision records. Every design choice that touches trust, scoring or signatures is marked for a second review before it is relied on.

## How it works

The platform does not replace existing security tools. It collects from them and from its own scanners, and keeps one view.

| Step | What it does |
|---|---|
| Find | Scanners for certificates and key files, TLS servers, SSH servers, software bills of materials, source code, and connectors for a certificate authority, a key vault and a cloud key service. A CSV import covers what no scanner reaches. |
| Inventory | One catalogue modelled on the CycloneDX 1.6 cryptographic assets. The same key seen by several sources is one asset, which keeps every sighting and the strongest evidence level: discovered, declared or attested. |
| Govern | Policy as code in Rego, such as no RSA below 3072 bits, no SHA-1, certificates valid for at most 398 days. A Python checker mirrors the rules and a test keeps their identifiers equal. Exceptions expire. |
| Prioritise | A score from weakness, exposure, data sensitivity, business criticality and the shelf life of the data against the time a migration takes. The score shows every factor, so a ranking can be checked by hand. |
| Prepare for change | A plan per asset: replace, hybrid, re-key, isolate or retire, aimed at ML-KEM-768, ML-DSA-65, SLH-DSA or the hybrid X25519MLKEM768. A device that cannot attest or cannot run post-quantum algorithms gets an isolate-or-replace step. |

## Aegis as an input

[Aegis](/projects/fpga-soc/microchip-polarfire-soc/aegis/) is a post-quantum remote-attestation system for embedded devices. Its signed results are the strongest evidence the inventory can hold: a device proved what it runs, with keys the platform checks itself.

The connector reads evidence packs and the signed policy and checks the signatures with its own verifier, not the gateway's word. On the Aegis bench, five endpoints were checked this way:

| Endpoint | Outcome in the inventory |
|---|---|
| NXP FRDM-RW612 | attested, hardware-rooted |
| Zynq UltraScale+ (OP-TEE) | attested, hardware-rooted |
| STM32H573I-DK, board 2 | attested, labelled software trust: its platform token is signed with a public development key |
| STM32H573I-DK, board 1 | quarantined, unplugged |
| Arduino Uno | unattestable, as designed |

The platform only reads. It never restarts a service or changes a policy on the gateway. A compiler can turn a platform policy into a proposed Aegis policy file with a readable diff, and a person applies it.

## Verification

- 402 automated tests, including a 10,000-asset ingest that deduplicates in about three seconds and a check of every export against the official CycloneDX 1.6 schema.
- 23 of 23 Rego tests pass in Open Policy Agent.
- A test estate in Docker holds weak and strong services on the local machine: an RSA-1024 server key, a SHA-1 signature, TLS 1.0 and 1.1, legacy ciphers, a ten-year certificate, weak SSH key exchanges, ciphers and MACs. The scanners found all eleven planted weaknesses and labelled none of them strong. Two of the eleven are only partly reproducible, see the limits.
- Signed evidence is verified for real: a tampered pack, a broken audit chain or a swapped key is refused.

## Limits, stated plainly

- The code is private for now. This page describes what was built and tested; it does not yet offer a download.
- Two planted weaknesses cannot be fully reproduced: the DSA SSH host key, because the current OpenSSH removed it, and 3DES, because the host's OpenSSL has no 3DES suites.
- The design records have had one pass by the same author and the agents. An independent review is still to come.
- The scanners read the local machine and test services only. Scanning a real network needs an explicit allowlist, on purpose.
- Only one Aegis endpoint is development-signed, and the platform says so; it does not call that hardware trust.
- The Go collectors exist as a skeleton only; the working collectors are in Python.
- A long soak run against the live bench is still to do.
