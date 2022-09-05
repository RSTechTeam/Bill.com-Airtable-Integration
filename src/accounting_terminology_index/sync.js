/** @fileoverview Syncs Bill.com Customers from Airtable to Bill.com. */

import {filter} from '../common/bill_com.js';
import {internalCustomerId} from '../common/inputs.js';
import {Base, PRIMARY_ORG_BILL_COM_ID} from '../common/airtable.js';

/**
 * @param {!Api} billComApi
 * @param {!Base=} accountingBase
 * @param {string=} internalCustomerId
 * @param {string=} customerTable
 * @param {string=} syncView
 * @param {string=} nameField
 * @return {!Promise<undefined>}
 */
export async function main(
    billComApi,
    accountingBase = new Base(),
    parentCustomerId = internalCustomerId(),
    customerTable = 'Labor Charge Field (LCF) Mapping',
    syncView = 'Bill.com Sync',
    nameField = 'Abacus / Bill.com / QBO Code') {

  // Initialize Bill.com Customer collection.
  await billComApi.primaryOrgLogin();
  const billComCustomers =
      await billComApi.list(
          'Customer', [filter('parentCustomerId', '=', parentCustomerId)]);
  const billComCustomerIds = new Set();
  billComCustomers.forEach(c => billComCustomerIds.add(c.id));

  // Upsert every Bill.com Customer from the Bill.com Sync View.
  const updates = [];
  await accountingBase.select(
      customerTable,
      syncView,
      async (record) => {
        const change = {
          obj: {
            entity: 'Customer',
            id: record.get(PRIMARY_ORG_BILL_COM_ID),
            isActive: '1',
            parentCustomerId: parentCustomerId,
            name: encodeURIComponent(record.get(nameField)),
          }
        }

        // Insert/Create in Bill.com any record with no primary org Bill.com ID.
        if (change.obj.id == undefined) {
          const response =
              await billComApi.dataCall('Crud/Create/Customer', change);
          await accountingBase.update(
              customerTable,
              [{
                id: record.getId(),
                fields: {[PRIMARY_ORG_BILL_COM_ID]: response.id},
              }]);
          return;
        }

        // Update in Bill.com other records with a primary org Bill.com ID.
        updates.push(change);
        billComCustomerIds.delete(id);
      });

  // Mark internal Bill.com Customers not in the Bill.com Sync View as inactive.
  for (const id of billComCustomerIds) {
    updates.push({obj: {entity: 'Customer', id: id, isActive: '2'}});
  }
  await billComApi.bulkCall('Update/Customer', updates);
}
