import { describe, expect, it } from 'vitest';
import { getWorkspaceAccess } from '../api/_lib/workspaceAccess';

describe('getWorkspaceAccess', () => {
  it('restricts cashiers to POS-safe workspace data', () => {
    expect(getWorkspaceAccess('cashier')).toEqual({
      canViewProcurement: false,
      canViewEmployees: false,
      canViewFinancialCost: false,
      canViewAllSales: false,
      salesLimit: 50,
    });
  });

  it('allows managers to view procurement but not employee records', () => {
    expect(getWorkspaceAccess('manager')).toEqual({
      canViewProcurement: true,
      canViewEmployees: false,
      canViewFinancialCost: true,
      canViewAllSales: true,
      salesLimit: 200,
    });
  });

  it('allows owners and admins to view employee records', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(getWorkspaceAccess(role).canViewEmployees).toBe(true);
    }
  });
});
