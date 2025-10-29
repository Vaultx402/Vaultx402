export default function Footer() {
  return (
    <nav className="navbar-expand stat-footer">
      <div className="row">
        <div className="col-3 text-left">
          <img src="/img/stat/weight.png" alt="Weight" className="md-img img-responsive" /> 99.6/100
        </div>
        <div className="col-3 text-left">
          <img src="/img/stat/currency.png" alt="Currency" className="md-img img-responsive" /> 70/70
        </div>
        <div className="col-6 text-right">
          <img src="/img/stat/pistol.png" alt="Gun Icon" className="img-sm img-responsive" />
          <img src="/img/stat/crosshair.png" alt="Crosshair Icon" className="img-sm img-responsive" />
          18
        </div>
      </div>
    </nav>
  );
}
