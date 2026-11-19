+++
title = "Glossary"
description = "Short definitions of the terms used in embedded systems and security, in plain words."
weight = 40

[params]
  topics = ["Reference"]
  # Term and definition side by side, with a filter box above the list.
  view = "glossary"
+++

## Microcontrollers

### Microcontroller

A single chip that combines a processor, memory and peripherals such as timers
and serial interfaces. It runs one firmware image, usually without a full
operating system.

### Startup code

The first code that runs after reset. It sets the stack pointer, copies
initialised data to RAM, clears the rest, and calls `main`.

### Vector table

The table of addresses the processor uses to find the initial stack pointer, the
reset handler and each interrupt handler.

### Interrupt

A signal that makes the processor pause its current code and run a handler. Its
priority decides which interrupt runs first when several are pending.

### Watchdog

A hardware timer that resets the chip unless software restarts it in time. If the
software hangs, it stops restarting the timer and the chip resets. Some watchdogs
cannot be stopped once started.

## Arm security features

### TrustZone for Armv8-M

A hardware feature of Armv8-M processors that splits the system into a Secure
world and a Non-secure world. Non-secure code cannot read or modify Secure memory,
and can call Secure code only through defined entry points.

### Secure and Non-secure state

The two security states of an Armv8-M processor with TrustZone. The state follows
the memory being executed: code in Secure memory runs in Secure state.

### SAU (Security Attribution Unit)

A programmable unit, configured by Secure privileged code, that marks address
ranges as Secure, Non-secure or Non-secure Callable.

### IDAU (Implementation Defined Attribution Unit)

A fixed attribution map built into the chip by its manufacturer. It works together
with the SAU: for each address, the more secure of the two attributes applies.

### NSC (Non-secure Callable)

A Secure memory region that Non-secure code is allowed to branch into, and the
only place where a secure gateway is valid.

### Secure gateway (SG)

The instruction that must be executed first when Non-secure code calls into the
Secure world. A branch into Secure memory that does not land on an SG instruction
in an NSC region raises a SecureFault.

### SecureFault

The exception raised on Armv8-M Mainline when a security rule is broken, for
example an invalid entry into the Secure world. Its cause is recorded in the SFSR
register.

### MPU (Memory Protection Unit)

Splits memory into regions with access permissions: read, write, execute,
privileged only. An RTOS uses it to isolate tasks from each other and from the
kernel. With TrustZone, each world can have its own MPU.

### Privileged and unprivileged

Two levels of access inside each security state. Unprivileged code cannot change
system registers or reach memory that the MPU reserves for privileged code.

### TF-M (Trusted Firmware-M)

Arm's open-source secure firmware for Armv8-M. It runs in the Secure state and
offers services such as cryptography, storage and attestation to Non-secure code.

### Secure partition

A unit of code and data that TF-M runs in the Secure state. Non-secure code reaches
it only through defined calls, and each partition has its own stack.

### TF-A (Trusted Firmware-A) and BL31

Arm's open-source secure firmware for Cortex-A processors. BL31 is the part that
stays resident at the highest exception level, EL3, and switches between the
normal world and the TrustZone secure world.

## Boot and trust

### Root of trust

The first code and keys a device relies on without being able to verify them,
typically immutable boot code and keys stored in hardware. Everything else is
verified from it.

### Secure boot

Checking the signature of each firmware stage before running it, so that only
code approved by the device maker executes.

### MCUboot

An open-source secure boot loader for microcontrollers. It checks the signature of
each image before starting it. TF-M uses it as its first stage, BL2.

### Chain of trust

The sequence in which each boot stage verifies the next, starting from the root
of trust.

### Anti-rollback

Refusing to boot firmware older than the latest accepted version, so that an
attacker cannot reinstall a version with a known flaw.

### Attestation

A signed report with which a device proves its identity and the firmware it is
running to a remote party.

### Attestation quote

The answer to an attestation request: the device's measurements and the verifier's
nonce, signed with the device's key. The verifier checks the signature, the nonce
and each measurement against what its policy allows.

### PSA attestation token

The attestation report defined by Arm's Platform Security Architecture, produced by
TF-M. It is a signed list of claims, such as the instance ID and a hash of each
image the boot loader started.

### Measured boot

A boot in which each stage records a hash of the next stage before starting it.
The records can then be reported in an attestation, so a verifier sees what was
started, not only that it was signed.

### Nonce

A value used once. A verifier sends a fresh random nonce and requires it to come
back inside the signed answer, so an old answer cannot be replayed.

### Trust on first use

Accepting a device's key the first time it is seen and requiring the same key
afterwards. It is only as trustworthy as the network at that first contact.

### PUF (physically unclonable function)

A circuit whose start-up behaviour differs from chip to chip because of
manufacturing variation. It is used to derive keys that are never stored.

### Helper data

Data stored next to a PUF that lets the chip rebuild the same key from the PUF's
slightly noisy start-up values. On its own it does not reveal the key.

### Black key and red key

A red key is a key in the clear. A black key is the same key encrypted under a key
only the chip can recover, for example from its PUF, so it can be stored in a boot
image or in fuses without exposing it.

### Hardware-unique key

A per-chip secret that software cannot read but can use, for example to derive
other keys through a hardware cipher. On STM32H5 it is called DHUK.

### Device key

A key that belongs to one chip, stored in it or derived from a chip secret such as a
PUF or a hardware-unique key. Another chip with the same firmware has a different
one. On the Zynq UltraScale+ the AES key that decrypts the boot image is also called
the device key.

### OTP and eFuses

Memory that can be written only once. Used for keys, device identity and lifecycle
state because it cannot be changed afterwards.

### CSU (configuration and security unit)

The block of the AMD Zynq UltraScale+ that runs the boot ROM and holds the AES and
SHA-3 engines and the PUF. It decrypts and checks the boot image.

### Boot header

The start of a Zynq UltraScale+ boot image. The boot ROM reads it first: it says
whether the image is encrypted and authenticated, and it can hold the PUF helper
data and a black key.

### FSBL (first stage boot loader)

The first program the Zynq UltraScale+ boot ROM loads from the boot image. It sets
up the chip and loads the PMU firmware, the bitstream and the next software stages.

### PMU firmware

Firmware for the platform management unit of the Zynq UltraScale+, a small separate
processor that handles power, resets and error monitoring for the rest of the chip.

### TEE (Trusted Execution Environment)

An isolated environment that runs sensitive code and holds secrets, separate from
the main software. On microcontrollers it is often built on TrustZone.

### OP-TEE

An open-source TEE for Cortex-A processors. It runs in the TrustZone secure world
beside Linux and runs trusted applications on request.

### Trusted application (TA)

A program that runs inside a TEE such as OP-TEE. Software in the normal world can
call it but cannot read its memory or its keys.

## Post-quantum cryptography

### Post-quantum cryptography

Public-key algorithms designed to stay secure against a large quantum computer,
which would break the elliptic-curve and RSA schemes in use today.

### ML-DSA

The NIST post-quantum signature algorithm (FIPS 204). ML-DSA-65 has a 1,952-byte
public key and a 3,309-byte signature.

### ML-KEM

The NIST post-quantum key-encapsulation algorithm (FIPS 203). One side
encapsulates a fresh secret to the other's public key; only the holder of the
private key can recover it.

### Hedged signing

Signing with fresh random bytes mixed into each signature, as FIPS 204 recommends for ML-DSA. The same message then gives
a different signature each time; a deterministic signer gives the same one, which helps some fault attacks.

### KMAC

A message authentication code built on SHA-3 (Keccak), standardised in NIST SP 800-185. It takes a key, a message, an
output length and a customisation string that keeps tags for different purposes apart.

### KEM (key-encapsulation mechanism)

A way for two parties to agree a shared secret: one sends a ciphertext that only
the other can turn back into the secret.

### ACVP test vectors

NIST's algorithm validation vectors: published inputs and expected outputs that
an implementation must reproduce exactly.

### Keccak

The permutation inside SHA-3 and SHAKE. ML-KEM and ML-DSA spend much of their time
in it.

### Sponge construction

How SHA-3 and SHAKE use Keccak. Input is mixed into a 1600-bit state a block at a time ("absorbed"), with one Keccak
permutation per block; output is read from the state a block at a time ("squeezed"), with a permutation before each
block. SHAKE can squeeze as much output as needed from one sponge.

### NTT (number-theoretic transform)

A fast way to multiply polynomials, used by ML-KEM and ML-DSA. It works like a
Fourier transform over integers modulo a prime.

## Zero trust and networks

### Zero trust

Granting access because a device or user has just proven who it is and what it
runs, not because it is on the inside of the network.

### Quarantine

Keeping a device that has not passed attestation away from everything except the
service that can attest it again.

### Heartbeat

A check, repeated every cycle, that an admitted device is still there and still
holds its session key. It is usually a MAC over a counter and a fresh nonce. A
missing or wrong heartbeat ends trust in the session.

### Credential lifetime (TTL)

How long a credential may be used after it is issued; TTL (time to live) is the time
left. A device that counts the lifetime on its own secure clock ends the session
itself, even when the issuer can no longer reach it.

### VLAN (802.1Q)

A tag on Ethernet frames that splits one physical network into separate virtual
ones. A switch must support it for the separation to hold.

### nftables

The Linux packet-filtering framework. Rules in tables and chains decide whether a
packet is accepted, dropped or logged.

### Connection tracking

The part of Linux packet filtering that remembers each connection, so that rules
can refer to new and established traffic. A blanket rule that accepts every
established packet keeps old connections alive after a policy changes.

## Attacks

### Fault injection

Disturbing a chip for a very short time so that it skips or corrupts an operation,
for example a signature check. Also called glitching.

### Voltage and clock glitching

Fault injection by briefly dropping the supply voltage or shortening a clock cycle.

### EMFI (electromagnetic fault injection)

Fault injection with a short electromagnetic pulse from a probe placed over the
chip, without modifying the board.

### Side-channel attack

Recovering secrets from measurements of a device at work, such as power
consumption, electromagnetic emission or timing, rather than from a flaw in the
algorithm.

### Power analysis (SPA, DPA, CPA)

Side-channel attacks on power consumption. Simple power analysis reads a single
trace. Differential and correlation power analysis combine many traces
statistically to recover a key.

## Debug and access

### JTAG and SWD

The debug interfaces of a microcontroller. They give full control of the processor
and memory, so a device that ships with them open exposes its firmware.

### Readout protection

A device setting that blocks reading flash through the debug port. Names and
levels differ between vendors.

### Debug authentication

Unlocking debug access only for someone who proves they hold the right credential,
instead of leaving the port permanently open or closed.

### XMPU and XPPU

The memory and peripheral protection units of the Zynq UltraScale+. They check each
bus access against the processor or device that made it, so Linux can be kept out
of a TEE's memory or away from the security unit.

### STRICT_DEVMEM

A Linux kernel option (`CONFIG_STRICT_DEVMEM`) that limits what `/dev/mem` can
reach. Without it, a root process can read and write physical memory directly.

## RTOS

### RTOS (real-time operating system)

A small operating system that runs tasks with predictable timing. It provides
scheduling, synchronisation and timers.

### Context switch

Saving the registers of the running task and restoring those of the next one. On
Cortex-M it usually happens in the PendSV exception.

### Stack overflow

A task using more stack than it was given, which corrupts whatever lies beyond it.
Armv8-M Mainline adds stack limit registers that raise a fault instead.

### High-water mark

The most stack a task or partition has used since start-up. It is found by filling
the stack with a known pattern and looking for the deepest byte that changed.

### Mutex and semaphore

Objects that tasks use to coordinate. A mutex protects a shared resource so that
one task uses it at a time. A semaphore counts events or available resources.

### Priority inversion

A high-priority task waiting for a resource held by a low-priority task, while a
medium-priority task keeps running. Priority inheritance in the mutex prevents it.

## FPGA

### FPGA (field-programmable gate array)

A chip whose logic is defined by configuration rather than fixed at manufacture.
It is made of configurable logic blocks, routing between them, and dedicated
blocks such as memory and multipliers.

### LUT (look-up table)

The basic logic element of an FPGA. A small memory that can implement any logic
function of its few inputs.

### HDL (hardware description language)

A language such as VHDL or Verilog that describes digital hardware. It describes
circuits that operate in parallel, not a sequence of instructions.

### Bitstream

The file that configures an FPGA. It can be encrypted and authenticated so that
the design cannot be copied or modified.

### DMA (direct memory access)

A hardware block copies data to or from memory by itself, without the processor moving each word. The processor sets
up the transfer and is told, or checks, when it is done.

### Timing closure

Making every signal path in a design fast enough for the target clock frequency,
after placement and routing.

## Secure coding and verification

### Undefined behaviour

Code whose result the C or C++ standard does not define, such as reading past
the end of an array or signed integer overflow. Compilers may do anything with
it, which makes it a common source of security flaws.

### Coding standard

A set of rules that restricts a language to its safer parts, for example MISRA C
or SEI CERT C.

### Verification plan

A document that lists what must be shown to work, how each item will be tested,
and how completion will be measured. A security verification plan does the same
for each protection and each attack it must withstand.

### Testbench

Code that drives a design with inputs and checks its outputs in simulation.

### Coverage

A measure of how much of a design or its specification the tests have exercised.

### Assertion

A statement of something that must always be true, checked automatically in
simulation or by formal tools.
