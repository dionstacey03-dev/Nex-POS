/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AcceptInvitationPage } from './components/auth/AcceptInvitationPage';
import { V2WorkspacePage } from './components/auth/V2WorkspacePage';
import { V2DataWorkspacePage } from './components/auth/V2DataWorkspacePage';
import { NexPosProvider, useNexPos } from './context/NexPosContext';
import { AppShell } from './components/layout/AppShell';
import { ReceiptModal } from './components/common/ReceiptModal';
import { DashboardView } from './components/views/DashboardView';
import { PosTerminalView } from './components/views/PosTerminalView';
import { ProductsView } from './components/views/ProductsView';
import { CategoriesView } from './components/views/CategoriesView';
import { InventoryView } from './components/views/InventoryView';
import { CustomersView } from './components/views/CustomersView';
import { SuppliersView } from './components/views/SuppliersView';
import { PurchasesView } from './components/views/PurchasesView';
import { SalesHistoryView } from './components/views/SalesHistoryView';
import { EmployeesView } from './components/views/EmployeesView';
import { ReportsView } from './components/views/ReportsView';
import { SettingsView } from './components/views/SettingsView';

const NexPosRouter: React.FC = () => {
  const { activeSection, activeBusiness, viewingReceipt, setViewingReceipt, loadingData } =
    useNexPos();

  if (loadingData) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-56 rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
      </div>
    );
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardView />;
      case 'pos':
        return <PosTerminalView />;
      case 'products':
        return <ProductsView />;
      case 'categories':
        return <CategoriesView />;
      case 'inventory':
        return <InventoryView />;
      case 'customers':
        return <CustomersView />;
      case 'suppliers':
        return <SuppliersView />;
      case 'purchases':
        return <PurchasesView />;
      case 'sales':
        return <SalesHistoryView />;
      case 'employees':
        return <EmployeesView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <>
      {renderSection()}
      <ReceiptModal
        sale={viewingReceipt}
        business={activeBusiness}
        onClose={() => setViewingReceipt(null)}
      />
    </>
  );
};

export default function App() {
  if (window.location.pathname === '/accept-invitation') {
    return <AcceptInvitationPage />;
  }

  if (window.location.pathname === '/v2') {
    return <V2WorkspacePage />;
  }

  if (window.location.pathname === '/v2/employees') {
    return <EmployeesView />;
  }

  if (window.location.pathname === '/v2/data') {
    return <V2DataWorkspacePage />;
  }

  return (
    <NexPosProvider>
      <AppShell>
        <NexPosRouter />
      </AppShell>
    </NexPosProvider>
  );
}
