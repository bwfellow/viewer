import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { toast } from 'sonner';

interface Flag {
  pattern: string;
  name: string;
  isActive: boolean;
  createdAt: number;
}

interface FlagManagerProps {
  appId: Id<"apps">;
  flags: Flag[];
  onUpdate: () => void;
}

export function FlagManager({ appId, flags, onUpdate }: FlagManagerProps) {
  const [newPattern, setNewPattern] = useState('');
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const addFlag = useMutation(api.apps.addFlag);
  const updateFlag = useMutation(api.apps.updateFlag);
  const deleteFlag = useMutation(api.apps.deleteFlag);

  const handleAddFlag = async () => {
    try {
      await addFlag({ appId, pattern: newPattern, name: newName });
      setNewPattern('');
      setNewName('');
      setIsAdding(false);
      onUpdate();
      toast.success('Flag added successfully');
    } catch (error) {
      toast.error('Failed to add flag: ' + error);
    }
  };

  const handleToggleFlag = async (index: number, isActive: boolean) => {
    try {
      await updateFlag({ appId, flagIndex: index, isActive });
      onUpdate();
      toast.success('Flag updated successfully');
    } catch (error) {
      toast.error('Failed to update flag: ' + error);
    }
  };

  const handleDeleteFlag = async (index: number) => {
    if (!confirm('Are you sure you want to delete this flag?')) return;
    try {
      await deleteFlag({ appId, flagIndex: index });
      onUpdate();
      toast.success('Flag deleted successfully');
    } catch (error) {
      toast.error('Failed to delete flag: ' + error);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Function Flags</h3>
        <button
          onClick={() => setIsAdding(true)}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Add Flag
        </button>
      </div>

      {isAdding && (
        <div className="mb-4 p-4 border rounded">
          <div className="flex gap-4 mb-2">
            <input
              type="text"
              placeholder="Pattern (e.g. query interactions:list success)"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              className="flex-1 px-2 py-1 border rounded"
            />
            <input
              type="text"
              placeholder="Display Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 px-2 py-1 border rounded"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddFlag}
              disabled={!newPattern || !newName}
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewPattern('');
                setNewName('');
              }}
              className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {flags?.map((flag, index) => (
          <div key={index} className="flex items-center justify-between p-2 border rounded">
            <div className="flex-1">
              <div className="font-medium">{flag.name}</div>
              <div className="text-sm text-gray-600">{flag.pattern}</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={flag.isActive}
                  onChange={(e) => handleToggleFlag(index, e.target.checked)}
                  className="mr-2"
                />
                Active
              </label>
              <button
                onClick={() => handleDeleteFlag(index)}
                className="px-2 py-1 text-red-500 hover:bg-red-100 rounded"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {(!flags || flags.length === 0) && !isAdding && (
        <div className="text-gray-500 text-center py-4">
          No flags configured. Add a flag to track specific function executions.
        </div>
      )}
    </div>
  );
}
