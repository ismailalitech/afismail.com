+++
title = "A range erase that left an old image behind: measurements that did not match"
date = '2026-11-18T07:58:00+01:00'
draft = false
description = "The RW612's secure partition reported SPE and NSPE values that differed from the PC's prediction. The partition was right: the flash held blocks of an older, larger image that a J-Link range erase had not cleared. Writing each partition whole fixed it."
weight = 67

[params]
+++

In [lab 58](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a12-trustzone-on-the-rw612/) the
Aegis partition hashes the whole secure and non-secure flash partitions, and a PC tool predicts the result: each image
followed by `0xFF` up to the end of its partition.

## Symptom

The first quote over the network had a valid signature and the right profile, but both measurements differed from the
prediction: `SPE 481e328c...` instead of `1798d88c...`, and `NSPE ea90d93c...` instead of `e221382e...`.

## Finding it

Read both partitions back with J-Link and compare them, block by block, with the predicted bytes:

- The hash of the flash read back equalled what the partition reported. The partition was measuring correctly.
- 15 blocks of 4 KB in the secure partition and 19 in the non-secure one differed. The first differing block of the
  secure partition held the text `y metadata... The`: a string from TF-M's regression suite, the larger image flashed
  earlier.

The flashing script had asked J-Link to erase the whole range first and then load the images. J-Link reported the
erase done, yet those blocks survived it.

## Fix

`flash.sh` no longer relies on an erase: it pads each image with `0xFF` to the full size of its partition and writes the
partition whole, so every block is rewritten and the flash equals the prediction by construction.

## Result

`SPE` and `NSPE` in the quote equal the PC tool's values exactly, and stay equal across reflashes. The partition being
right and the expectation being wrong is the useful outcome here: a measurement of the whole partition caught leftovers
that a hash of the image alone would never have seen.
