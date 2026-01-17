import { useState } from 'react';

// Theme colors defined inline for the mockup
const themes = {
  light: {
    surfaceBase: '#f5f0e8',
    surfaceElevated: '#ffffff',
    surfaceMuted: '#e8dcc8',
    textPrimary: '#2c1810',
    textSecondary: '#6b5b4f',
    textMuted: '#8a7b6b',
    deceasedPrimary: '#8b0000',
    deceasedBg: '#faf5f5',
    deceasedBorder: '#d4a5a5',
    deceasedTabActive: '#8b0000',
    livingPrimary: '#b8860b',
    livingBg: '#faf6e9',
    livingTabActive: '#b8860b',
    lifespanEarly: '#8b0000',
    lifespanEarlyTrack: '#f5e5e5',
    lifespanLonger: '#228b22',
    lifespanLongerTrack: '#e5f5e5',
    circleBg: '#f5f0e8',
    circleTrack: '#e8dcc8',
    circleProgress: '#8b0000',
    circleOrnament: '#d4c4a8',
    inputBg: '#ffffff',
    inputBorder: '#d4c4a8',
    tagBg: '#f0ebe4',
    tagBorder: '#d4c4a8',
    tagText: '#6b5b4f',
  },
  dark: {
    surfaceBase: '#1a1613',
    surfaceElevated: '#252119',
    surfaceMuted: '#2d2720',
    textPrimary: '#f0ebe4',
    textSecondary: '#c4b8a8',
    textMuted: '#9a8d7d',
    deceasedPrimary: '#e85c5c',
    deceasedBg: '#2a1f1f',
    deceasedBorder: '#5c3838',
    deceasedTabActive: '#c94a4a',
    livingPrimary: '#e8b84a',
    livingBg: '#282418',
    livingTabActive: '#c9a227',
    lifespanEarly: '#e05555',
    lifespanEarlyTrack: '#3a2525',
    lifespanLonger: '#4caf50',
    lifespanLongerTrack: '#253a25',
    circleBg: '#201c18',
    circleTrack: '#3d3530',
    circleProgress: '#c94a4a',
    circleOrnament: '#4d443a',
    inputBg: '#1a1613',
    inputBorder: '#4d443a',
    tagBg: '#2d2720',
    tagBorder: '#4d443a',
    tagText: '#c4b8a8',
  }
};

// Skull icon component
const SkullIcon = ({ color }) => (
  <svg width="48" height="48" viewBox="0 0 100 100" fill={color}>
    <ellipse cx="30" cy="45" rx="10" ry="12" />
    <ellipse cx="70" cy="45" rx="10" ry="12" />
    <ellipse cx="50" cy="35" rx="35" ry="30" />
    <ellipse cx="50" cy="55" rx="10" ry="8" fill={color === '#f0ebe4' ? '#1a1613' : '#f5f0e8'} />
    <rect x="35" y="65" width="6" height="10" />
    <rect x="47" y="65" width="6" height="10" />
    <rect x="59" y="65" width="6" height="10" />
    <path d="M 15 45 Q 5 45, 10 35" stroke={color} fill="none" strokeWidth="4" />
    <path d="M 85 45 Q 95 45, 90 35" stroke={color} fill="none" strokeWidth="4" />
  </svg>
);

// Progress circle with decorative elements
const ProgressCircle = ({ percentage, t }) => {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const progress = (percentage / 100) * circumference;
  const ornamentCount = 12;
  
  return (
    <svg width="180" height="180" viewBox="0 0 180 180">
      {/* Decorative dots */}
      {[...Array(ornamentCount)].map((_, i) => {
        const angle = (i / ornamentCount) * 2 * Math.PI - Math.PI / 2;
        const x = 90 + 78 * Math.cos(angle);
        const y = 90 + 78 * Math.sin(angle);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="4"
            fill={t.circleOrnament}
          />
        );
      })}
      
      {/* Background circle */}
      <circle
        cx="90"
        cy="90"
        r={radius}
        fill={t.circleBg}
        stroke={t.circleTrack}
        strokeWidth="12"
      />
      
      {/* Progress arc */}
      <circle
        cx="90"
        cy="90"
        r={radius}
        fill="none"
        stroke={t.circleProgress}
        strokeWidth="12"
        strokeDasharray={`${progress} ${circumference - progress}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
      />
      
      {/* Text */}
      <text
        x="90"
        y="85"
        textAnchor="middle"
        fill={t.deceasedPrimary}
        fontSize="32"
        fontWeight="bold"
        fontFamily="Playfair Display, serif"
      >
        {percentage}%
      </text>
      <text
        x="90"
        y="105"
        textAnchor="middle"
        fill={t.textSecondary}
        fontSize="14"
        fontFamily="Inter, sans-serif"
      >
        deceased
      </text>
    </svg>
  );
};

// Life expectancy bar
const LifespanBar = ({ age, expected, diedEarly, t }) => {
  const maxAge = 85;
  const livedPercent = (age / maxAge) * 100;
  const expectedPercent = (expected / maxAge) * 100;
  
  return (
    <div style={{ width: '140px' }}>
      <div style={{ 
        height: '8px', 
        backgroundColor: diedEarly ? t.lifespanEarlyTrack : t.lifespanLongerTrack,
        borderRadius: '4px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${livedPercent}%`,
          backgroundColor: diedEarly ? t.lifespanEarly : t.lifespanLonger,
          borderRadius: '4px',
        }} />
        {diedEarly && (
          <div style={{
            position: 'absolute',
            left: `${livedPercent}%`,
            top: 0,
            height: '100%',
            width: `${expectedPercent - livedPercent}%`,
            backgroundImage: `repeating-linear-gradient(
              90deg,
              ${t.lifespanEarly}40,
              ${t.lifespanEarly}40 2px,
              transparent 2px,
              transparent 4px
            )`,
          }} />
        )}
      </div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        fontSize: '10px',
        color: t.textMuted,
        marginTop: '2px',
        fontFamily: 'Inter, sans-serif'
      }}>
        <span>0</span>
        <span>{maxAge} yrs</span>
      </div>
    </div>
  );
};

// Actor card
const ActorCard = ({ name, role, date, age, yearsEarly, cause, diedEarly, t }) => (
  <div style={{
    backgroundColor: t.surfaceElevated,
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
    boxShadow: t === themes.dark 
      ? '0 1px 3px rgba(0,0,0,0.3)' 
      : '0 1px 3px rgba(0,0,0,0.08)',
  }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{
          width: '56px',
          height: '70px',
          backgroundColor: t.surfaceMuted,
          borderRadius: '4px',
        }} />
        <div>
          <div style={{ 
            fontWeight: '600', 
            color: t.textPrimary,
            fontFamily: 'Inter, sans-serif'
          }}>{name}</div>
          <div style={{ 
            fontSize: '14px', 
            color: t.textSecondary,
            fontStyle: 'italic',
            fontFamily: 'Inter, sans-serif'
          }}>{role}</div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ 
          color: t.deceasedPrimary,
          fontWeight: '500',
          fontFamily: 'Inter, sans-serif'
        }}>{date}</div>
        <div style={{ 
          fontSize: '14px', 
          color: t.textSecondary,
          fontFamily: 'Inter, sans-serif'
        }}>
          Age {age} <span style={{ color: diedEarly ? t.lifespanEarly : t.lifespanLonger }}>
            ({yearsEarly} years {diedEarly ? 'early' : 'longer'})
          </span>
        </div>
        <LifespanBar age={age} expected={diedEarly ? age + parseInt(yearsEarly) : age} diedEarly={diedEarly} t={t} />
        <div style={{ 
          fontSize: '13px', 
          color: t.textSecondary, 
          marginTop: '4px',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          fontFamily: 'Inter, sans-serif'
        }}>{cause}</div>
      </div>
    </div>
  </div>
);

// Tag component
const Tag = ({ children, t }) => (
  <span style={{
    display: 'inline-block',
    padding: '4px 10px',
    fontSize: '12px',
    backgroundColor: t.tagBg,
    border: `1px solid ${t.tagBorder}`,
    borderRadius: '4px',
    color: t.tagText,
    marginRight: '6px',
    marginBottom: '6px',
    fontFamily: 'Inter, sans-serif'
  }}>
    {children}
  </span>
);

// Main component
export default function DarkModeMockup() {
  const [isDark, setIsDark] = useState(true);
  const t = isDark ? themes.dark : themes.light;
  
  return (
    <div style={{
      backgroundColor: t.surfaceBase,
      minHeight: '100vh',
      padding: '24px',
      fontFamily: 'Inter, sans-serif',
      transition: 'background-color 0.3s ease',
    }}>
      {/* Theme toggle */}
      <div style={{ 
        position: 'fixed', 
        top: '16px', 
        right: '16px', 
        zIndex: 100 
      }}>
        <button
          onClick={() => setIsDark(!isDark)}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: 'none',
            backgroundColor: isDark ? '#c9a227' : '#6b4423',
            color: isDark ? '#1a1613' : '#ffffff',
            fontWeight: '500',
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif'
          }}
        >
          {isDark ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>
      
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <SkullIcon color={t.textPrimary} />
            <h1 style={{ 
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: '42px',
              fontStyle: 'italic',
              color: t.textPrimary,
              margin: 0,
            }}>
              Dead on Film
            </h1>
          </div>
          <p style={{ color: t.textSecondary, margin: 0 }}>
            Search for a movie or TV show to see which cast members have passed away
          </p>
        </div>
        
        {/* Search */}
        <div style={{ 
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '24px'
        }}>
          <input
            type="text"
            placeholder="Search movies and TV shows..."
            style={{
              width: '100%',
              maxWidth: '500px',
              padding: '12px 16px',
              borderRadius: '8px',
              border: `1px solid ${t.inputBorder}`,
              backgroundColor: t.inputBg,
              color: t.textPrimary,
              fontSize: '16px',
              fontFamily: 'Inter, sans-serif',
            }}
          />
        </div>
        
        {/* Movie Page Demo */}
        <div style={{ 
          backgroundColor: t.surfaceElevated,
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: t === themes.dark 
            ? '0 4px 6px rgba(0,0,0,0.4)' 
            : '0 4px 6px rgba(0,0,0,0.07)',
        }}>
          <h2 style={{ 
            fontFamily: 'Playfair Display, serif',
            color: t.deceasedPrimary,
            textAlign: 'center',
            marginTop: 0,
            fontSize: '28px',
          }}>
            Point Break
          </h2>
          <p style={{ 
            textAlign: 'center', 
            color: t.textSecondary,
            marginTop: '-8px' 
          }}>(1991)</p>
          
          {/* Circle and poster */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            gap: '32px',
            marginBottom: '24px'
          }}>
            <div style={{
              width: '120px',
              height: '180px',
              backgroundColor: t.surfaceMuted,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: t.textMuted,
              fontSize: '12px',
            }}>
              Poster
            </div>
            <ProgressCircle percentage={17} t={t} />
          </div>
          
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <span style={{ color: t.textSecondary }}>Expected: </span>
            <span style={{ color: t.textPrimary }}>4.1</span>
            <span style={{ color: t.textMuted }}> | </span>
            <span style={{ color: t.textSecondary }}>Actual: </span>
            <span style={{ color: t.deceasedPrimary, fontWeight: '600' }}>5</span>
            <div style={{ color: t.deceasedPrimary, fontSize: '13px', marginTop: '4px' }}>
              Higher Than Expected
            </div>
          </div>
          
          {/* Tabs */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center',
            gap: '4px',
            marginBottom: '24px' 
          }}>
            <button style={{
              padding: '8px 20px',
              borderRadius: '6px 0 0 6px',
              border: 'none',
              backgroundColor: t.deceasedTabActive,
              color: '#ffffff',
              fontWeight: '500',
              cursor: 'pointer',
            }}>
              Deceased (5)
            </button>
            <button style={{
              padding: '8px 20px',
              borderRadius: '0 6px 6px 0',
              border: `1px solid ${t.inputBorder}`,
              backgroundColor: 'transparent',
              color: t.textSecondary,
              cursor: 'pointer',
            }}>
              Living (25)
            </button>
          </div>
          
          <h3 style={{ 
            fontFamily: 'Playfair Display, serif',
            color: t.textPrimary,
            marginBottom: '16px'
          }}>
            Deceased Cast Members
          </h3>
          
          <ActorCard 
            name="Tom Sizemore"
            role="as DEA Agent Deets"
            date="Mar 3, 2023"
            age={62}
            yearsEarly="13"
            cause="Anoxic Brain Injury"
            diedEarly={true}
            t={t}
          />
          
          <ActorCard 
            name="Jack Kehler"
            role="as Halsey"
            date="May 7, 2022"
            age={76}
            yearsEarly="4"
            cause="Complications From Lewy Body Dementia"
            diedEarly={false}
            t={t}
          />
          
          <ActorCard 
            name="Patrick Swayze"
            role="as Bodhi / Mask President"
            date="Sep 14, 2009"
            age={57}
            yearsEarly="17"
            cause="Pancreatic Cancer"
            diedEarly={true}
            t={t}
          />
        </div>
        
        {/* Actor Detail Demo */}
        <div style={{ 
          backgroundColor: t.surfaceElevated,
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: t === themes.dark 
            ? '0 4px 6px rgba(0,0,0,0.4)' 
            : '0 4px 6px rgba(0,0,0,0.07)',
        }}>
          <h2 style={{ 
            fontFamily: 'Playfair Display, serif',
            color: t.deceasedPrimary,
            marginTop: 0,
          }}>
            Rob Reiner <span style={{ fontWeight: 'normal' }}>(Deceased)</span>
          </h2>
          
          <p style={{ color: t.textSecondary, margin: '4px 0' }}>
            <strong style={{ color: t.textPrimary }}>Born:</strong> Mar 6, 1947 in The Bronx, New York City
          </p>
          <p style={{ color: t.textSecondary, margin: '4px 0' }}>
            <strong style={{ color: t.textPrimary }}>Died:</strong> Dec 14, 2025 (age 78)
          </p>
          <p style={{ color: t.textSecondary, margin: '4px 0' }}>
            <strong style={{ color: t.textPrimary }}>Cause of Death:</strong> Stab Wound
          </p>
          
          <div style={{ marginTop: '16px' }}>
            <Tag t={t}>Homicide</Tag>
            <Tag t={t}>Family Tragedy</Tag>
            <Tag t={t}>Multiple Deaths</Tag>
            <Tag t={t}>Media Sensation</Tag>
          </div>
        </div>
        
        {/* Color Palette Reference */}
        <div style={{ 
          backgroundColor: t.surfaceElevated,
          borderRadius: '12px',
          padding: '24px',
          boxShadow: t === themes.dark 
            ? '0 4px 6px rgba(0,0,0,0.4)' 
            : '0 4px 6px rgba(0,0,0,0.07)',
        }}>
          <h3 style={{ 
            fontFamily: 'Playfair Display, serif',
            color: t.textPrimary,
            marginTop: 0,
          }}>
            {isDark ? 'Dark' : 'Light'} Mode Palette
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px' }}>
            {Object.entries(t).slice(0, 12).map(([name, color]) => (
              <div key={name}>
                <div style={{
                  width: '100%',
                  height: '40px',
                  backgroundColor: color,
                  borderRadius: '4px',
                  border: `1px solid ${t.inputBorder}`,
                }} />
                <div style={{ 
                  fontSize: '10px', 
                  color: t.textSecondary,
                  marginTop: '4px',
                  wordBreak: 'break-all'
                }}>
                  {name}
                </div>
                <div style={{ 
                  fontSize: '10px', 
                  color: t.textMuted,
                  fontFamily: 'monospace'
                }}>
                  {color}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
