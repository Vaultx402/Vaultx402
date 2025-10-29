'use client';

import Navigation from '../components/Navigation';
import Footer from '../components/Footer';

export default function DataPage() {
  return (
    <>
      <Navigation />

      <div className="container">
        <div className="row">
          <div className="col-12">
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <h2 style={{ fontSize: '28px', marginBottom: '20px' }}>DATA</h2>
              <p style={{ fontSize: '18px' }}>Quest and data logs coming soon...</p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
