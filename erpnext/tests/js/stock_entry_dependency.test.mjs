import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

const source = new URL(
  "../../public/js/controllers/stock_controller.js",
  import.meta.url
);
const metadata = JSON.parse(
  fs.readFileSync(
    new URL(
      "../../stock/doctype/stock_entry/stock_entry.json",
      import.meta.url
    ),
    "utf8"
  )
);

// A fresh Desk loads the shared stock controller, without executing Stock Entry's form script.
function load_stock_controller() {
  const sandbox = {
    erpnext: { stock: {} },
    frappe: { provide() {}, ui: { form: { Controller: class {} } } },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(source, "utf8"), sandbox);
  return sandbox;
}

const cases = [
  ["Repack", { purpose: "Repack" }, false],
  ["Send to Subcontractor", { purpose: "Send to Subcontractor" }, true],
  ["return transfer", { purpose: "Material Transfer", is_return: 1 }, true],
  ["regular transfer", { purpose: "Material Transfer", is_return: 0 }, false],
  ["transfer without return flag", { purpose: "Material Transfer" }, false],
  ["missing purpose", { is_return: 1 }, false],
  ["missing fields", {}, false],
  ["null field values", { purpose: null, is_return: null }, false],
  [
    "another return purpose",
    { purpose: "Material Receipt", is_return: 1 },
    false,
  ],
];

describe("Stock Entry dependencies before the full form is loaded", () => {
  it("loads the stock controller from the Desk bundle", () => {
    const bundle = fs.readFileSync(
      new URL("../../public/js/erpnext.bundle.js", import.meta.url),
      "utf8"
    );
    assert.match(bundle, /import ["']\.\/controllers\/stock_controller["']/);
  });

  it("makes the helper available in the Desk stock controller", () => {
    const sandbox = load_stock_controller();
    assert.equal(
      typeof sandbox.erpnext.stock.is_subcontracting_or_return_transfer,
      "function"
    );
  });

  for (const [name, doc, expected] of cases) {
    it(`evaluates the actual metadata dependencies for ${name}`, () => {
      const sandbox = load_stock_controller();
      sandbox.doc = doc;
      const fields = metadata.fields.filter((field) =>
        field.depends_on?.includes(
          "erpnext.stock.is_subcontracting_or_return_transfer"
        )
      );
      assert.equal(fields.length, 6);
      for (const field of fields) {
        assert.equal(
          Boolean(
            vm.runInContext(field.depends_on.slice("eval:".length), sandbox)
          ),
          expected,
          field.fieldname
        );
      }
    });
  }
});
