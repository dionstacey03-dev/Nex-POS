import type { BusinessRole } from './authz.js';

export function getWorkspaceAccess(role: BusinessRole) {
  const isOwnerOrAdmin = role === 'owner' || role === 'admin';
  const canViewOperations = isOwnerOrAdmin || role === 'manager';

  return {
    canViewProcurement: canViewOperations,
    canViewEmployees: isOwnerOrAdmin,
    canViewFinancialCost: canViewOperations,
    canViewAllSales: canViewOperations,
    salesLimit: canViewOperations ? 200 : 50,
  } as const;
}
