import React, { useEffect, useState } from 'react';
import { ShieldCheck, Link2 } from 'lucide-react';

interface Attestation {
  validator: string;
  checkpointHash: string;
  score: number;
  timestamp: number;
}

export default function ValidationProofs() {
  const [proofs, setProofs] = useState<Attestation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchProofs = async () => {
      try {
        const res = await fetch('/api/attestations');
        if (res.ok) {
          const data = await res.json();
          if (mounted) setProofs(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchProofs();
    const interval = setInterval(fetchProofs, 6000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading && proofs.length === 0) {
    return <div className="card glass-panel" style={{ minHeight: '200px' }}><p className="muted">Fetching Secure Attestations...</p></div>;
  }

  return (
    <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <ShieldCheck color="#0070F3" size={20} />
        <h3 className="panel-title" style={{ margin: 0 }}>ON-CHAIN VALIDATION PROOFS</h3>
      </div>
      
      {proofs.length === 0 ? (
        <div className="empty-state">No cryptographic proofs detected on-chain.</div>
      ) : (
        <div className="proof-table-container">
          <table className="proof-table">
            <thead>
              <tr>
                <th>TIME</th>
                <th>EIP-712 INTENT HASH</th>
                <th>VALIDATOR</th>
                <th style={{ textAlign: 'right' }}>SCORE</th>
              </tr>
            </thead>
            <tbody>
              {proofs.map((p, i) => (
                <tr key={`${p.checkpointHash}-${i}`}>
                  <td className="muted">{new Date(p.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="hash-cell">
                    <div className="hash-box">{p.checkpointHash.substring(0, 16)}...</div>
                  </td>
                  <td className="hash-cell">
                    <a href={`https://sepolia.etherscan.io/address/${p.validator}`} target="_blank" rel="noreferrer" className="validator-link">
                      {p.validator.substring(0, 8)}... <Link2 size={12} />
                    </a>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={p.score >= 90 ? 'score-badge excellence' : p.score >= 50 ? 'score-badge average' : 'score-badge poor'}>
                      {p.score}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
