/* Cortex-M fault decoder. Runs entirely in the browser: nothing is sent anywhere.
   Bit definitions follow the Armv7-M and Armv8-M architecture reference manuals. */
(function () {
  var form = document.querySelector('[data-fault-form]');
  var output = document.querySelector('[data-fault-output]');
  if (!form || !output) { return; }

  var REGISTERS = {
    cfsr: {
      name: 'CFSR',
      bits: [
        [0, 'IACCVIOL', 'MemManage', 'An instruction was fetched from a location that does not allow execution.'],
        [1, 'DACCVIOL', 'MemManage', 'Data was read or written at a location the MPU does not allow. The stacked PC points to the instruction.'],
        [3, 'MUNSTKERR', 'MemManage', 'Access violation while unstacking on exception return.'],
        [4, 'MSTKERR', 'MemManage', 'Access violation while stacking on exception entry. Often a stack that has grown into a protected region.'],
        [5, 'MLSPERR', 'MemManage', 'Access violation during lazy floating-point state saving.'],
        [7, 'MMARVALID', 'MemManage', 'MMFAR (0xE000ED34) holds the address that faulted.'],
        [8, 'IBUSERR', 'BusFault', 'Bus error on an instruction fetch.'],
        [9, 'PRECISERR', 'BusFault', 'Bus error on a data access. The stacked PC points to the instruction that caused it.'],
        [10, 'IMPRECISERR', 'BusFault', 'Bus error reported after the access that caused it. The stacked PC is not the cause.'],
        [11, 'UNSTKERR', 'BusFault', 'Bus error while unstacking on exception return.'],
        [12, 'STKERR', 'BusFault', 'Bus error while stacking on exception entry.'],
        [13, 'LSPERR', 'BusFault', 'Bus error during lazy floating-point state saving.'],
        [15, 'BFARVALID', 'BusFault', 'BFAR (0xE000ED38) holds the address that faulted.'],
        [16, 'UNDEFINSTR', 'UsageFault', 'An undefined instruction was executed.'],
        [17, 'INVSTATE', 'UsageFault', 'Invalid execution state. Often a branch to an address without the Thumb bit set.'],
        [18, 'INVPC', 'UsageFault', 'An invalid value was loaded into the PC on exception return.'],
        [19, 'NOCP', 'UsageFault', 'A coprocessor was used while disabled or absent. Typically the FPU has not been enabled.'],
        [20, 'STKOF', 'UsageFault', 'The stack pointer went past its limit register (Armv8-M Mainline).'],
        [24, 'UNALIGNED', 'UsageFault', 'Unaligned memory access.'],
        [25, 'DIVBYZERO', 'UsageFault', 'Division by zero, with the divide-by-zero trap enabled.']
      ]
    },
    hfsr: {
      name: 'HFSR',
      bits: [
        [1, 'VECTTBL', 'HardFault', 'Bus error while reading the vector table. Check the vector table address.'],
        [30, 'FORCED', 'HardFault', 'A configurable fault was escalated to HardFault. The original cause is in CFSR.'],
        [31, 'DEBUGEVT', 'HardFault', 'A debug event occurred while debug was not enabled, for example a breakpoint instruction with no debugger attached.']
      ]
    },
    sfsr: {
      name: 'SFSR',
      bits: [
        [0, 'INVEP', 'SecureFault', 'Invalid entry point. Non-secure code branched into Secure memory at an address that is not a valid secure gateway.'],
        [1, 'INVIS', 'SecureFault', 'Invalid integrity signature in the exception stack frame.'],
        [2, 'INVER', 'SecureFault', 'Invalid exception return.'],
        [3, 'AUVIOL', 'SecureFault', 'Attribution unit violation. Non-secure code accessed an address marked Secure.'],
        [4, 'INVTRAN', 'SecureFault', 'Invalid transition. Secure code branched to Non-secure code without using the instructions meant for it.'],
        [5, 'LSPERR', 'SecureFault', 'Error during lazy floating-point state preservation.'],
        [6, 'SFARVALID', 'SecureFault', 'SFAR (0xE000EDE8) holds the address that faulted.'],
        [7, 'LSERR', 'SecureFault', 'Lazy state error.']
      ]
    }
  };
  var EXAMPLE = { cfsr: '0x00008200', hfsr: '0x40000000', sfsr: '' };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function hex(value) {
    return '0x' + ('00000000' + value.toString(16).toUpperCase()).slice(-8);
  }

  /* Returns a number, null for an empty field, or NaN for text that is not a 32-bit hex value. */
  function parse(text) {
    var clean = text.replace(/[\s_]/g, '').replace(/^0x/i, '');
    if (clean === '') { return null; }
    if (!/^[0-9a-fA-F]{1,8}$/.test(clean)) { return NaN; }
    return parseInt(clean, 16);
  }

  function isSet(value, bit) {
    return Math.floor(value / Math.pow(2, bit)) % 2 === 1;
  }

  function decode(key, value) {
    var reg = REGISTERS[key];
    var block = el('section', 'reg-result');
    block.appendChild(el('h3', '', reg.name + ' = ' + hex(value)));

    var known = 0;
    var list = el('ul', 'bit-list');
    reg.bits.forEach(function (b) {
      known += Math.pow(2, b[0]);
      if (!isSet(value, b[0])) { return; }
      var item = el('li', 'bit');
      var head = el('p', 'bit-head');
      head.appendChild(el('span', 'bit-name', b[1]));
      head.appendChild(el('span', 'bit-meta', b[2] + ', bit ' + b[0]));
      item.appendChild(head);
      item.appendChild(el('p', 'bit-text', b[3]));
      list.appendChild(item);
    });

    if (list.children.length) {
      block.appendChild(list);
    } else {
      block.appendChild(el('p', 'bit-none', 'No fault bits are set in this register.'));
    }

    var unknown = [];
    for (var bit = 0; bit < 32; bit++) {
      if (isSet(value, bit) && !isSet(known, bit)) { unknown.push(bit); }
    }
    if (unknown.length) {
      block.appendChild(el('p', 'bit-warning', 'Reserved bits are set (' + unknown.join(', ') + '). Check that the value was copied correctly.'));
    }
    return block;
  }

  function run() {
    var results = [];
    var valid = true;
    var values = {};

    Object.keys(REGISTERS).forEach(function (key) {
      var input = form.elements[key];
      var error = document.getElementById(input.id + '-error');
      var value = parse(input.value);
      if (value !== null && isNaN(value)) {
        valid = false;
        input.setAttribute('aria-invalid', 'true');
        error.textContent = 'Enter up to 8 hexadecimal digits, for example 0x00008200.';
        return;
      }
      input.removeAttribute('aria-invalid');
      error.textContent = '';
      if (value !== null) {
        values[key] = value;
        results.push(decode(key, value));
      }
    });

    output.textContent = '';
    if (!valid) {
      output.appendChild(el('p', 'empty', 'Correct the highlighted value, then press Decode again.'));
      return;
    }
    if (!results.length) {
      output.appendChild(el('p', 'empty', 'Enter at least one register value in hexadecimal, then press Decode.'));
      return;
    }
    results.forEach(function (r) { output.appendChild(r); });

    if (values.hfsr !== undefined && isSet(values.hfsr, 30) && values.cfsr === undefined) {
      output.appendChild(el('p', 'bit-warning', 'FORCED is set in HFSR. Add the CFSR value to see the original fault.'));
    }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    run();
  });

  var example = form.querySelector('[data-fault-example]');
  if (example) {
    example.addEventListener('click', function () {
      Object.keys(EXAMPLE).forEach(function (key) { form.elements[key].value = EXAMPLE[key]; });
      run();
    });
  }

  var clear = form.querySelector('[data-fault-clear]');
  if (clear) {
    clear.addEventListener('click', function () {
      Object.keys(REGISTERS).forEach(function (key) { form.elements[key].value = ''; });
      run();
    });
  }
})();
