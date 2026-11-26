'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

test('invoice totals and GST match checkout for HSN-rated items with a coupon', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 1000, qty: 1 }];
  var checkout = pricing.computeTotals(items, 'SAVE10');
  var invoiceFigures = invoice.computeInvoiceFigures({ items: items, coupon: 'SAVE10' });

  assert.deepEqual({
    subtotal: invoiceFigures.subtotal,
    discount: invoiceFigures.discount,
    tax: invoiceFigures.tax,
    cgst: invoiceFigures.cgst,
    sgst: invoiceFigures.sgst,
    total: invoiceFigures.total,
    lineGst: invoiceFigures.rows[0].gstPercent
  }, {
    subtotal: checkout.subtotal,
    discount: checkout.discount,
    tax: checkout.tax,
    cgst: checkout.cgst,
    sgst: checkout.sgst,
    total: checkout.total,
    lineGst: checkout.lines[0].gstPercent
  });
});

test('checkout applies the HSN slab and discounts subtotal before GST', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 1000, qty: 1 }];
  var totals = pricing.computeTotals(items, 'SAVE10');

  assert.deepEqual({
    subtotal: totals.subtotal,
    discount: totals.discount,
    taxable: totals.taxable,
    tax: totals.tax,
    cgst: totals.cgst,
    sgst: totals.sgst,
    total: totals.total
  }, {
    subtotal: 1000,
    discount: 100,
    taxable: 900,
    tax: 45,
    cgst: 22.5,
    sgst: 22.5,
    total: 945
  });
});

test('invoice applies the checkout HSN slab and coupon discount', function () {
  var order = {
    id: 41,
    coupon: 'SAVE10',
    total: 945,
    items: [{ name: 'Rice', hsn: '1006', price: 1000, qty: 1 }]
  };
  var figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual({
    subtotal: figures.subtotal,
    discount: figures.discount,
    tax: figures.tax,
    cgst: figures.cgst,
    sgst: figures.sgst,
    total: figures.total,
    lineGst: figures.rows[0].gstPercent
  }, {
    subtotal: 1000,
    discount: 100,
    tax: 45,
    cgst: 22.5,
    sgst: 22.5,
    total: 945,
    lineGst: 5
  });
});

test('invoice uses the checkout decimal interpretation for line gstRate', function () {
  var figures = invoice.computeInvoiceFigures({
    items: [{ name: 'Small rate', price: 100, qty: 1, gstRate: 0.05 }]
  });

  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.tax, 5);
  assert.equal(figures.total, 105);
});

test('reconciliation skips cancelled orders and matches invoices to the ledger', function () {
  var db = {
    orders: [
      {
        id: 41,
        date: '2026-01-01',
        customer: 'Sample customer',
        coupon: 'SAVE10',
        subtotal: 1000,
        discount: 100,
        tax: 45,
        total: 945,
        items: [{ name: 'Rice', hsn: '1006', price: 1000, qty: 1 }]
      },
      {
        id: 42,
        status: 'cancelled',
        items: [{ name: 'Ignored', price: 100, qty: 1 }]
      }
    ]
  };
  var reconciliation = reports.getGstReconciliation(db);

  assert.equal(reconciliation.totalChecked, 1);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.totalDelta, 0);
  assert.equal(reconciliation.rows[0].invoiceTax, 45);
  assert.equal(reconciliation.rows[0].invoiceTotal, 945);
  assert.equal(reconciliation.rows[0].delta, 0);
  assert.equal(reconciliation.rows[0].matched, true);
});

test('invoice render prints the computed CGST and SGST values', function () {
  var html = invoice.render({
    id: 7,
    total: 118,
    items: [{ name: 'Item', price: 100, qty: 1 }]
  });

  assert.match(html, /<td>CGST<\/td><td class="r">[^0-9]*9\.00/);
  assert.match(html, /<td>SGST<\/td><td class="r">[^0-9]*9\.00/);
  assert.match(html, /Invoice Total/);
});
