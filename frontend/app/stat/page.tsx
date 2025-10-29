'use client';

import { useState } from 'react';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';

export default function StatPage() {
  const [activeTab, setActiveTab] = useState('status');

  return (
    <>
      <Navigation />

      <div className="container">
        <div className="row">
          <div className="col-12">
            <ul className="nav nav-tabs" id="myTab">
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === 'status' ? 'active' : ''}`}
                  href="#status"
                  onClick={(e) => { e.preventDefault(); setActiveTab('status'); }}
                  role="tab"
                >
                  STATUS
                </a>
              </li>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === 'special' ? 'active' : ''}`}
                  href="#special"
                  onClick={(e) => { e.preventDefault(); setActiveTab('special'); }}
                  role="tab"
                >
                  SPECIAL
                </a>
              </li>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === 'perks' ? 'active' : ''}`}
                  href="#perks"
                  onClick={(e) => { e.preventDefault(); setActiveTab('perks'); }}
                  role="tab"
                >
                  PERKS
                </a>
              </li>
            </ul>

            <div className="tab-content" id="myTabContent">
              <div className={`tab-pane fade ${activeTab === 'status' ? 'show active' : ''}`} id="status" role="tabpanel">
                <div className="stat-bars">
                  <div className="row">
                    <div className="col-12">
                      <div className="username">VAULT DWELLER</div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-4">
                      <div>Level</div>
                    </div>
                    <div className="col-8">
                      <div className="stat-numbers">
                        <span>50</span>
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-4">
                      <div>HP</div>
                    </div>
                    <div className="col-8">
                      <div className="level-progress">
                        <div className="level-progress-bar w-80"></div>
                      </div>
                      <span className="points">250/310</span>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-4">
                      <div>AP</div>
                    </div>
                    <div className="col-8">
                      <div className="level-progress">
                        <div className="level-progress-bar w-60"></div>
                      </div>
                      <span className="points">60/100</span>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-4">
                      <div>XP</div>
                    </div>
                    <div className="col-8">
                      <div className="level-progress">
                        <div className="level-progress-bar w-30"></div>
                      </div>
                      <span className="points">15000/50000</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className={`tab-pane fade ${activeTab === 'special' ? 'show active' : ''}`} id="special" role="tabpanel">
                <div className="stat-bars">
                  <div className="row">
                    <div className="col-4">
                      <div>Strength</div>
                    </div>
                    <div className="col-8">
                      <span className="points">8</span>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-4">
                      <div>Perception</div>
                    </div>
                    <div className="col-8">
                      <span className="points">6</span>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-4">
                      <div>Endurance</div>
                    </div>
                    <div className="col-8">
                      <span className="points">7</span>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-4">
                      <div>Charisma</div>
                    </div>
                    <div className="col-8">
                      <span className="points">4</span>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-4">
                      <div>Intelligence</div>
                    </div>
                    <div className="col-8">
                      <span className="points">9</span>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-4">
                      <div>Agility</div>
                    </div>
                    <div className="col-8">
                      <span className="points">7</span>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-4">
                      <div>Luck</div>
                    </div>
                    <div className="col-8">
                      <span className="points">5</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className={`tab-pane fade ${activeTab === 'perks' ? 'show active' : ''}`} id="perks" role="tabpanel">
                <ul className="spc-list">
                  <li><a href="#">Gun Nut (Rank 4)</a></li>
                  <li><a href="#">Locksmith (Rank 3)</a></li>
                  <li><a href="#">Science! (Rank 2)</a></li>
                  <li><a href="#">Rifleman (Rank 5)</a></li>
                  <li><a href="#">Armorer (Rank 3)</a></li>
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
