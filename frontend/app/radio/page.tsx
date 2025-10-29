'use client';

import Navigation from '../components/Navigation';
import Footer from '../components/Footer';

export default function RadioPage() {
  return (
    <>
      <Navigation />

      <div className="container">
        <div className="row">
          <div className="col-12">
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <h2 style={{ fontSize: '28px', marginBottom: '20px' }}>RADIO</h2>
              <p style={{ fontSize: '18px' }}>Radio frequencies coming soon...</p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
