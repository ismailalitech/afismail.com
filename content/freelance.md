+++
# Name of the page in breadcrumbs and search results.
title = "Freelance"
# The sentence under the headline.
description = "We are a team of engineers covering an embedded product from mechanical design and hardware to firmware, FPGA and secure design, with one contact throughout."

[params]
  # The large headline at the top of the page.
  headline = "An engineering team for embedded products"
  # The title shown in the browser tab and in search results.
  head_title = "Freelance engineering team for embedded products"
  # The sentence under "Work with me" on the home page.
  home_text = "I take on freelance engineering in firmware, FPGA/SoC integration and embedded security, and run hands-on team training on request."
  # Draws this page with its own layout (layouts/_partials/freelance.html).
  view = "freelance"
  # The contact block at the end of the page.
  contact = true
  contact_title = "Discuss a project"
  contact_text = "Tell us the hardware or platform, the current issue or goal, and your timeline. Write to"

  # The sentence under "What we cover".
  cover_intro = "Most products need more than one discipline. We take on a single part or the whole chain."

  # Typical requests (the section "When teams call us").
  requests = [
    "A new product that needs mechanics, hardware and firmware designed together.",
    "A board that does not come up, or firmware that crashes and nobody can say why.",
    "Firmware to write or restructure, bare-metal or on an RTOS.",
    "A processor system and FPGA fabric that have to work together.",
    "HDL that needs a design review or a verification plan.",
    "A product that needs TrustZone, secure boot, or proof that its protections work.",
    "C or C++ that needs a review for memory safety.",
  ]

  # Team training: the paragraph, and the example subjects.
  training_text = "We run hands-on sessions for engineering teams when a team asks for one. A session is built around exercises on a board: each participant builds, flashes and debugs the code, and keeps the material afterwards. The content is prepared for your hardware and your team's level, so tell us both when you write."
  training_subjects = ["Arm Cortex-M and TrustZone", "FPGA design, UVM verification and optimisation", "Embedded Linux", "RTOS"]

  # The lists below each start with [[params.name]]. Keep them after the lines above:
  # a plain line placed under one of them would be read as part of that list.

  # What the team covers, in the order a product is built. Add, remove or reword freely.
  [[params.disciplines]]
    title = "Mechanical design"
    text = "Enclosures and mechanical parts, designed around the electronics."
  [[params.disciplines]]
    title = "Hardware"
    text = "Schematics, PCB design and bring-up of the first boards."
  [[params.disciplines]]
    title = "Firmware & RTOS"
    text = "Drivers, board bring-up and fault debugging, bare-metal or on an RTOS, on Arm Cortex-M, Cortex-A and Cortex-R, RISC-V and other cores."
  [[params.disciplines]]
    title = "FPGA & SoC"
    text = "HDL design and verification, timing closure, processor integration, and design optimisation, for example to raise bandwidth."
  [[params.disciplines]]
    title = "Secure design"
    text = "Security designed for the hardware you have chosen and for your constraints."

  # The ways to work together.
  [[params.formats]]
    title = "A defined project"
    text = "A piece of work with an agreed result: a driver, a board bring-up, a subsystem, or a complete prototype. Scope, deliverables and schedule are written down before work starts."
  [[params.formats]]
    title = "Support for your team"
    text = "An engineer works alongside your team for a set period, on your hardware and in your repository: a hard bug, a bring-up, or extra hands before a deadline."
  [[params.formats]]
    title = "A review"
    text = "An independent look at a design, at firmware or at a security architecture. You receive a written report: what we found, how serious it is, and what we recommend."

  # How a project runs, step by step.
  [[params.steps]]
    title = "You describe the need"
    text = "Three things are enough: the hardware or platform, the current issue or goal, and the timeline."
  [[params.steps]]
    title = "We reply with questions or a proposal"
    text = "The proposal states the scope, the deliverables, the schedule, and who will work on it."
  [[params.steps]]
    title = "Work starts on an agreed scope"
    text = "Nothing starts before the scope is agreed in writing. You then get regular updates and can see the work as it advances."
  [[params.steps]]
    title = "Handover"
    text = "You receive the sources and their documentation, with a walk-through for the people who will maintain them."

  # What a client can count on.
  [[params.principles]]
    title = "One contact"
    text = "I lead every project and stay your contact, whichever engineers are involved."
  [[params.principles]]
    title = "Scope in writing"
    text = "What is included, and what is not, is agreed before any work starts."
  [[params.principles]]
    title = "Confidentiality"
    text = "We sign a non-disclosure agreement before you share details, if you need one."
  [[params.principles]]
    title = "Work you can maintain"
    text = "Documented sources and a handover, so your team does not depend on us afterwards."

+++
