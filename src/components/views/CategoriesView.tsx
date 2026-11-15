import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Edit3,
  FolderTree,
  GripVertical,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useNexPos } from '../../context/NexPosContext';
import { Category } from '../../types/nexpos';
import { haptics } from '../../utils/haptics';

const COLOR_PRESETS = ['#2563EB', '#0EA5E9', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

export const CategoriesView: React.FC = () => {
  const { categories, products, can, saveCategory, reorderCategories, deleteCategory } =
    useNexPos();
  const canManage = can('manage_categories');
  const canDelete = can('delete_products');

  const [orderedCategories, setOrderedCategories] = useState<Category[]>(categories);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [reorderNotice, setReorderNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOrderedCategories(categories);
  }, [categories]);

  const openCreate = () => {
    haptics.light();
    setEditing(null);
    setName('');
    setDescription('');
    setColor('#2563EB');
    setActive(true);
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    haptics.light();
    setEditing(cat);
    setName(cat.name);
    setDescription(cat.description ?? '');
    setColor(cat.color ?? '#2563EB');
    setActive(cat.active);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      haptics.warning();
      return;
    }
    setSaving(true);
    try {
      await saveCategory({
        id: editing?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        active,
      });
      haptics.success();
      setModalOpen(false);
    } catch {
      haptics.error();
    } finally {
      setSaving(false);
    }
  };

  const commitOrder = async (nextList: Category[]) => {
    const previousList = orderedCategories;
    setOrderedCategories(nextList);
    setReordering(true);
    setReorderNotice(null);
    try {
      await reorderCategories(nextList.map((c) => c.id));
      haptics.success();
      setReorderNotice({
        type: 'success',
        text: 'Category order saved and synced to POS Terminal filters.',
      });
    } catch (err) {
      haptics.error();
      setOrderedCategories(previousList);
      setReorderNotice({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to save category order. Please try again.',
      });
    } finally {
      setReordering(false);
    }
  };

  const moveCategory = (fromIndex: number, toIndex: number) => {
    if (
      !canManage ||
      reordering ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= orderedCategories.length ||
      toIndex >= orderedCategories.length
    ) {
      return;
    }
    const next = [...orderedCategories];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    void commitOrder(next);
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, categoryId: string) => {
    if (!canManage || reordering) return;
    setDraggedId(categoryId);
    setDragOverId(categoryId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', categoryId);
    haptics.selection();
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    if (!canManage || !draggedId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== targetId) {
      setDragOverId(targetId);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    if (!canManage || reordering) return;
    const sourceId = draggedId || e.dataTransfer.getData('text/plain');
    setDraggedId(null);
    setDragOverId(null);

    if (!sourceId || sourceId === targetId) return;

    const fromIdx = orderedCategories.findIndex((c) => c.id === sourceId);
    const toIdx = orderedCategories.findIndex((c) => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    moveCategory(fromIdx, toIdx);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const activeOrdered = orderedCategories.filter((c) => c.active);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Categories
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {canManage
              ? 'Drag and drop categories to set their display sequence in the POS Terminal filter bar.'
              : 'Organize catalog departments for fast POS terminal filtering and analytics.'}
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Category
          </button>
        )}
      </div>

      {/* Reorder Save Status Notice */}
      {reorderNotice && (
        <div
          role={reorderNotice.type === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-2.5 text-xs font-medium flex items-center justify-between gap-3 ${
            reorderNotice.type === 'error'
              ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
              : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{reorderNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setReorderNotice(null)}
            className="p-0.5 cursor-pointer"
            aria-label="Dismiss order notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Live POS Terminal Filter Bar Preview */}
      {orderedCategories.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
              POS Filter Order:
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold shrink-0">
              All Categories
            </span>
            {activeOrdered.map((cat) => (
              <span
                key={cat.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-medium text-slate-700 dark:text-slate-200 shrink-0"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color || '#2563EB' }}
                />
                {cat.name}
              </span>
            ))}
          </div>

          {reordering && (
            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 shrink-0">
              Saving order...
            </span>
          )}
        </div>
      )}

      {orderedCategories.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
          <FolderTree className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="text-sm font-semibold">No categories created yet</div>
          <p className="text-xs text-slate-500">
            Create categories to group products on the POS terminal.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orderedCategories.map((cat, idx) => {
            const count = products.filter((p) => p.categoryId === cat.id).length;
            const isDragging = draggedId === cat.id;
            const isDropTarget = dragOverId === cat.id && draggedId !== null && draggedId !== cat.id;

            return (
              <div
                key={cat.id}
                draggable={canManage && !reordering}
                onDragStart={(e) => handleDragStart(e, cat.id)}
                onDragOver={(e) => handleDragOver(e, cat.id)}
                onDrop={(e) => handleDrop(e, cat.id)}
                onDragEnd={handleDragEnd}
                className={`rounded-xl border bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4 transition-all ${
                  isDragging
                    ? 'opacity-45 scale-[0.98] border-blue-400 dark:border-blue-500'
                    : isDropTarget
                    ? 'border-blue-600 ring-2 ring-blue-500/30 bg-blue-50/40 dark:bg-blue-950/20'
                    : 'border-slate-200 dark:border-slate-800'
                } ${canManage ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {canManage && (
                      <div
                        className="mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                        title="Drag to reorder category"
                        aria-hidden="true"
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>
                    )}
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0 mt-1"
                      style={{ backgroundColor: cat.color || '#2563EB' }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-semibold text-slate-400 tabular-nums">
                          #{idx + 1}
                        </span>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {cat.name}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {cat.description || 'No description provided.'}
                      </p>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0 || reordering}
                        onClick={() => {
                          haptics.selection();
                          moveCategory(idx, idx - 1);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                        aria-label={`Move ${cat.name} earlier`}
                        title="Move earlier"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === orderedCategories.length - 1 || reordering}
                        onClick={() => {
                          haptics.selection();
                          moveCategory(idx, idx + 1);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                        aria-label={`Move ${cat.name} later`}
                        title="Move later"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(cat)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer"
                        aria-label={`Edit ${cat.name}`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            haptics.warning();
                            void deleteCategory(cat.id);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          aria-label={`Delete ${cat.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                    {count} {count === 1 ? 'product' : 'products'}
                  </span>
                  <span
                    className={
                      cat.active
                        ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                        : 'text-slate-400 font-medium'
                    }
                  >
                    {cat.active ? 'Active' : 'Hidden'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Edit Category' : 'Add Category'}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold">
                {editing ? 'Edit Category' : 'Create Category'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  haptics.light();
                  setModalOpen(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        setColor(c);
                      }}
                      className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${
                        color === c ? 'ring-2 ring-offset-2 ring-blue-600 scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Select color ${c}`}
                    />
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => {
                    haptics.selection();
                    setActive(e.target.checked);
                  }}
                  className="rounded border-slate-300 text-blue-600"
                />
                Show category on POS Terminal
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    haptics.light();
                    setModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
