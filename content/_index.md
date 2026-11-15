+++
# The role shown under your name on the home page.
title = "Embedded systems & security engineer"

[params]
  # The sentence under the role.
  intro = "I develop and debug firmware, integrate FPGA/SoC systems, and help teams verify embedded security."

  # The moving background of the home page: a circuit board drawn in fine lines.
  #   "rise"   the board rises from the bottom of the first screen
  #   "tilt"   the same board seen at an angle, as in a photo of a board
  #   "full"   a faint board behind the whole page
  #   "none"   no background
  background = "rise"

  # Optional photo or capture on the right of the home page: put the file in
  # static/images/, remove the "# " from the four lines below and fill them in (the
  # caption is optional). Width and height are the size of the file in pixels.
  # hero_image = "images/polarfire-board.jpg"
  # hero_image_alt = "PolarFire SoC Discovery Kit on the bench, with a logic analyser attached"
  # hero_image_caption = "PolarFire SoC Discovery Kit, with the MSS UART on a logic analyser."
  # hero_image_size = [1600, 1200]

  # The three areas of work. "link" and "link_text" are optional: add them when there is
  # a service, a case study or a note to point to.
  [[params.expertise]]
    title = "Firmware & RTOS"
    text = "Board bring-up, drivers and fault debugging, bare-metal or on an RTOS, on Arm Cortex-M, Cortex-A and Cortex-R, RISC-V and other cores."
    link = "/work/cortex-m-fault-decoder/"
    link_text = "Example: a Cortex-M fault decoder"
  [[params.expertise]]
    title = "FPGA & SoC"
    text = "HDL design and verification, timing closure, processor integration, and design optimisation, for example to raise bandwidth."
  [[params.expertise]]
    title = "Secure design"
    text = "Hardware security and embedded security: side-channel attacks, secure boot, TrustZone, debug authentication and root of trust."

  # The three steps shown at the top of the Expertise page.
  [[params.steps]]
    title = "Read the idea"
    text = "Each subject starts with a short explanation of the concept and why it matters."
  [[params.steps]]
    title = "Watch the explanation"
    text = "Where a video helps, it sits at the top of the page."
  [[params.steps]]
    title = "Run the lab"
    text = "Labs list the board and tools, give every step, and end with the result to expect."
+++
