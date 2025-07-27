import React, { useState, useEffect } from 'react';
import { getUsageData, getAuthHeaders } from '../api';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

function UsageAnalysisModal({ show, onHide, theme, t }) {
  const [usageData, setUsageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleDownload = () => {
    fetch('/api/usage/download', {
      headers: getAuthHeaders()
    })
      .then(response => response.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dreamer-v_usage_data.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(err => {
        console.error('Download error:', err);
        setError('Failed to download usage data.');
      });
  };

  useEffect(() => {
    if (show) {
      setLoading(true);
      getUsageData()
        .then(data => {
          setUsageData(data);
          setLoading(false);
        })
        .catch(err => {
          setError('Failed to load usage data.');
          setLoading(false);
        });
    }
  }, [show]);

  if (!show) {
    return null;
  }

  return (
    <>
      <div className="modal fade show" style={{ display: 'block' }} tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered" style={{maxWidth: '90%'}}>
          <div 
            className={`modal-content ${theme === 'dark' ? 'bg-dark text-light' : ''}`}
            style={{boxShadow: '0 0 20px rgba(0, 123, 255, 0.5)'}}
          >
            <div className="modal-header">
              <h5 className="modal-title">
                <i className="bi bi-bar-chart-line-fill me-2"></i>
                {t('usageAnalysis')}
              </h5>
              <button type="button" className={`btn-close ${theme === 'dark' ? 'btn-close-white' : ''}`} onClick={onHide}></button>
            </div>
            <div className="modal-body">
              {loading ? (
                <p>Loading...</p>
              ) : error ? (
                <p>{error}</p>
              ) : usageData ? (
                <div>
                  <div className="row text-center mb-4">
                    <div className="col">
                      <h3>{usageData.total_videos}</h3>
                      <p className="text-muted">Total Videos Generated</p>
                    </div>
                    <div className="col">
                      <h3>{usageData.total_seconds}</h3>
                      <p className="text-muted">Total Seconds Generated</p>
                    </div>
                  </div>
                  <div className="row justify-content-center">
                    <div className="col-md-4 text-center">
                      <h5>Videos by Model</h5>
                      <div style={{ maxWidth: '350px', margin: 'auto' }}>
                      <Pie
                        data={{
                          labels: usageData.videos_by_model.map(item => item.model),
                          datasets: [{
                            data: usageData.videos_by_model.map(item => item.count),
                            backgroundColor: ['#2C3E50', '#E74C3C', '#F39C12', '#1ABC9C', '#9B59B6'],
                            borderColor: theme === 'dark' ? '#495057' : '#FFFFFF',
                            borderWidth: 1,
                          }]
                        }}
                        options={{
                          plugins: {
                            legend: {
                              position: 'bottom',
                              labels: {
                                color: theme === 'dark' ? '#E9ECEF' : '#495057'
                              }
                            }
                          }
                        }}
                      />
                      </div>
                    </div>
                    <div className="col-md-4 text-center">
                      <h5>Videos by Length (seconds)</h5>
                      <div style={{ maxWidth: '350px', margin: 'auto' }}>
                      <Pie
                        data={{
                          labels: usageData.videos_by_length.map(item => `${item.length}s`),
                          datasets: [{
                            data: usageData.videos_by_length.map(item => item.count),
                            backgroundColor: ['#2C3E50', '#E74C3C', '#F39C12', '#1ABC9C', '#9B59B6'],
                            borderColor: theme === 'dark' ? '#495057' : '#FFFFFF',
                            borderWidth: 1,
                          }]
                        }}
                        options={{
                          plugins: {
                            legend: {
                              position: 'bottom',
                              labels: {
                                color: theme === 'dark' ? '#E9ECEF' : '#495057'
                              }
                            }
                          }
                        }}
                      />
                      </div>
                    </div>
                    {usageData.is_admin && (
                      <div className="col-md-4 text-center">
                        <h5>Videos by User</h5>
                        <div style={{ maxWidth: '350px', margin: 'auto' }}>
                        <Pie
                          data={{
                            labels: usageData.videos_by_user.map(item => item.user),
                            datasets: [{
                              data: usageData.videos_by_user.map(item => item.count),
                              backgroundColor: ['#2C3E50', '#E74C3C', '#F39C12', '#1ABC9C', '#9B59B6'],
                              borderColor: theme === 'dark' ? '#495057' : '#FFFFFF',
                              borderWidth: 1,
                            }]
                          }}
                          options={{
                            plugins: {
                              legend: {
                                position: 'bottom',
                                labels: {
                                  color: theme === 'dark' ? '#E9ECEF' : '#495057'
                                }
                              }
                            }
                          }}
                        />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p>No usage data available.</p>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={handleDownload}>
                <i className="bi bi-download me-2"></i>
                {t('downloadUsageData')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onHide}>{t('closeButtonLabel')}</button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
}

export default UsageAnalysisModal;
