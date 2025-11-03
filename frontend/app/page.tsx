'use client';

import { useState, useEffect } from 'react';
import Navigation from './components/Navigation';
import Footer from './components/Footer';
import VaultDoorIntro from './components/VaultDoorIntro';

export default function Home() {
  const [activeTab, setActiveTab] = useState('weapon');
  const [showIntro, setShowIntro] = useState(true);

  const handleIntroComplete = () => {
    // VaultDoorIntro handles its own fade, just remove it when done
    setShowIntro(false);
  };

  return (
    <>
      {showIntro && (
        <VaultDoorIntro onComplete={handleIntroComplete} />
      )}

      <Navigation />

      <div className="container">
        <div className="row">
          <div className="col-12">
            <ul className="nav nav-tabs" id="myTab">
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === 'weapon' ? 'active' : ''}`}
                  href="#weapon"
                  onClick={(e) => { e.preventDefault(); setActiveTab('weapon'); }}
                  role="tab"
                >
                  WEAPON
                </a>
              </li>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === 'armor' ? 'active' : ''}`}
                  href="#armor"
                  onClick={(e) => { e.preventDefault(); setActiveTab('armor'); }}
                  role="tab"
                >
                  ARMOR
                </a>
              </li>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === 'aid' ? 'active' : ''}`}
                  href="#aid"
                  onClick={(e) => { e.preventDefault(); setActiveTab('aid'); }}
                  role="tab"
                >
                  AID
                </a>
              </li>
            </ul>

            <div className="tab-content" id="myTabContent">
              <div className={`tab-pane fade ${activeTab === 'weapon' ? 'show active' : ''} full`} id="weapon" role="tabpanel">
                <ul className="item-list">
                  <li><a href="#" className="the-gainer">The Gainer</a></li>
                  <li><a href="#" className="combat-rifle">Combat Rifle</a></li>
                  <li><a href="#" className="double-barrel-shotgun">Double Barrel Shotgun</a></li>
                  <li><a href="#" className="10mm-smg">10mm submachine gun</a></li>
                  <li><a href="#" className="gauss-rifle">Gauss Rifle</a></li>
                  <li><a href="#" className="gatling-gun">Gatling Gun</a></li>
                  <li><a href="#" className="m79-gnd-lnchr">M79 grenade launcher</a></li>
                  <li><a href="#" className="reba">Reba</a></li>
                  <li><a href="#" className="laser-gun">Laser gun</a></li>
                  <li><a href="#" className="bfg-9000">BFG 9000</a></li>
                </ul>

                <div className="weapon-showcase">
                  <div className="item-image">

                  </div>
                </div>

                <ul className="item-stats">
                  <div className="row-highlight">
                    <div className="row">
                      <div className="col-8">
                        <div className="pull-left">Damage</div>
                      </div>
                      <div className="col-4">
                        <img src="/img/stat/crosshair.png" className="pull-left" alt="crosshair" />
                        <span className="damage pull-right">--</span>
                      </div>
                    </div>
                  </div>
                  <div className="row-highlight">
                    <div className="row">
                      <div className="col-12">
                        <img src="/img/stat/bullets.png" className="pull-left" alt="bullets" />
                        <div className="ammo-type pull-left">Ammo</div>
                        <span className="ammo-count pull-right">--</span>
                      </div>
                    </div>
                  </div>
                  <div className="row-highlight">
                    <div className="row">
                      <div className="col-12">
                        <span className="fire-rate pull-right">--</span>
                        <div className="pull-left">Fire Rate</div>
                      </div>
                    </div>
                  </div>
                  <div className="row-highlight">
                    <div className="row">
                      <div className="col-12">
                        <span className="range pull-right">--</span>
                        <div className="pull-left">Range</div>
                      </div>
                    </div>
                  </div>
                  <div className="row-highlight">
                    <div className="row">
                      <div className="col-12">
                        <span className="accuracy pull-right">--</span>
                        <div className="pull-left">Accuracy</div>
                      </div>
                    </div>
                  </div>
                  <div className="row-highlight">
                    <div className="row">
                      <div className="col-12">
                        <span className="value pull-right">--</span>
                        <div className="pull-left">Value</div>
                      </div>
                    </div>
                  </div>
                  <div className="row-highlight">
                    <div className="row">
                      <div className="col-12">
                        <span className="weight pull-right">--</span>
                        <div className="pull-left">Weight</div>
                      </div>
                    </div>
                  </div>
                </ul>
              </div>
              <div className={`tab-pane fade ${activeTab === 'armor' ? 'show active' : ''} full`} id="armor" role="tabpanel">
                <ul className="item-list">
                  <li><a href="#">Power Armor</a></li>
                  <li><a href="#">Combat Armor</a></li>
                  <li><a href="#">Leather Armor</a></li>
                  <li><a href="#">Vault Suit</a></li>
                </ul>
              </div>
              <div className={`tab-pane fade ${activeTab === 'aid' ? 'show active' : ''} full`} id="aid" role="tabpanel">
                <ul className="item-list">
                  <li><a href="#">Stimpak</a></li>
                  <li><a href="#">RadAway</a></li>
                  <li><a href="#">Rad-X</a></li>
                  <li><a href="#">Nuka-Cola</a></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
