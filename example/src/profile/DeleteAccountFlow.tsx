import { useState } from 'react';
import { 
  AlertTriangle, 
  Trash2, 
  X, 
  CheckCircle2, 
  Loader2,
  ArrowLeft
} from 'lucide-react';
import { 
  getSupabaseClient, 
  useAuth, 
  useAuthStore 
} from '@fretwork/lib';

interface DeleteAccountFlowProps {
  onClose: () => void;
}

export function DeleteAccountFlow({ onClose }: DeleteAccountFlowProps) {
  const { signOut } = useAuth();
  const profile = useAuthStore((s) => s.profile);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [step, setStep] = useState<'warning' | 'confirm' | 'processing' | 'success' | 'error'>('warning');

  const handleStartDeletion = () => {
    setStep('confirm');
  };

  const handleConfirmDeletion = async () => {
    // Verify name matches profile display name
    if (confirmName !== profile?.displayName) {
      setError('Name does not match your profile display name. Please try again.');
      setStep('error');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStep('processing');

    try {
      const client = getSupabaseClient();
      
      // 1. Call the cleanup RPC (database cleanup)
      const { error: rpcError } = await client.rpc('delete_account_cleanup');
      if (rpcError) throw rpcError;

      // 2. Call the Edge Function (auth removal)
      const { error: funcError } = await client.functions.invoke('delete-user');
      if (funcError) throw funcError;

      // 3. Success!
      setStep('success');
      
      // Delay sign-out to let user see success state
      setTimeout(async () => {
        await signOut();
        onClose();
      }, 3000);

    } catch (err: any) {
      console.error('[DeleteAccountFlow] Deletion error:', err);
      setError(err.message || 'An error occurred during deletion. Please try again.');
      setStep('error');
      setIsProcessing(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal-deep/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-charcoal-raised border border-border/40 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/20">
          <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
            Account Management
          </h2>
          {step !== 'success' && step !== 'error' && (
            <button 
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div className="p-6">
          {step === 'warning' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center gap-3 text-amber-400">
                <AlertTriangle size={32} />
                <h3 className="text-xl font-bold">Are you sure?</h3>
              </div>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  This action is <span className="text-amber-400 font-bold">permanent</span> and cannot be undone. 
                </p>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Your profile and private content will be deleted.</li>
                  <li>Your shared content will be orphaned and attributed to <span className="italic">[Deleted User]</span>.</li>
                  <li>Any teacher-student relationships will be terminated.</li>
                </ul>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={onClose}
                  className="flex-1 h-10 px-4 rounded-md border border-border/40 text-sm font-medium hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartDeletion}
                  className="flex-1 h-10 px-4 rounded-md bg-red-500/10 text-red-400 border border-red-500/30 text-sm font-bold hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} /> Delete Account
                </button>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="space-y-2">
                <h3 className="text-lg font-bold">Final Confirmation</h3>
                <p className="text-sm text-muted-foreground">
                  To prevent accidental deletion, please type your 
                  <span className="text-foreground font-mono ml-1 font-bold"> {profile?.displayName}</span> below.
                </p>
              </div>

              <div className="space-y-1.5">
                <input
                  type="text"
                  autoFocus
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  className="w-full bg-charcoal-deep border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-red-500/50 transition-colors font-mono"
                  placeholder="Type your display name"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setStep('warning')}
                  className="flex-1 h-10 px-4 rounded-md border border-border/40 text-sm font-medium hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <button
                  onClick={handleConfirmDeletion}
                  disabled={!confirmName || isProcessing}
                  className="flex-1 h-10 px-4 rounded-md bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>Delete Permanently</>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-4 animate-pulse">
              <Loader2 size={48} className="text-degree-root animate-spin" />
              <p className="text-sm font-mono text-muted-foreground text-center">
                Executing secure deletion protocol...<br/>
                This may take a moment.
              </p>
            </div>
          )}

          {step === 'success' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center animate-in zoom-in-95 duration-300">
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <CheckCircle2 size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">Account Deleted</h3>
                <p className="text-sm text-muted-foreground">
                  Your account and private data have been successfully removed.
                </p>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center gap-3 text-red-400">
                <AlertTriangle size={32} />
                <h3 className="text-xl font-bold">Error</h3>
              </div>
              <div className="p-4 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-mono">
                {error}
              </div>
              <button
                onClick={() => setStep('warning')}
                className="w-full h-10 px-4 rounded-md bg-charcoal-raised border border-border/40 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
