/*{
  "DESCRIPTION": "Slow lava lamp blobs",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.1, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.6, 0.0, 0.6, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 0.25 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.3, "MAX": 2.0, "DEFAULT": 1.0 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "blobCount", "TYPE": "long", "MIN": 1, "MAX": 8, "DEFAULT": 5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  // Drive along X when the render is a 1-pixel-tall line
  if (RENDERSIZE.y < 2.0) {
    uv.y = uv.x;
  }
  // Aspect to keep blob shapes pleasing on different canvases
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 scu = vec2(uv.x, uv.y);
  scu.x = (scu.x - 0.5) * aspect + 0.5;

  const int MAX_BLOBS = 8;
  const float PI = 3.14159265;
  // Slow, long-period motion — 60s base loop scaled by speed
  float basePeriod = 60.0;
  float t = TIME * speed * (2.0 * PI / basePeriod);

  // Parameters derived from user controls
  float s = clamp(scale, 0.3, 2.0);
  float soft = clamp(softness, 0.0, 1.0);
  int count = int(clamp(float(blobCount), 1.0, 8.0));

  // Compute additive gaussian-like metaball field
  float field = 0.0;
  for (int i = 0; i < MAX_BLOBS; i++) {
    if (i >= count) {
      break;
    }
    // Evenly place base positions across X, jitter Y slightly
    float fi = float(i);
    float fc = float(count);
    vec2 base = vec2((fi + 0.5) / fc, 0.5 + 0.08 * sin(t * 0.6 + fi * 2.1));

    // Each blob orbits slowly with small different phases for organic motion
    float angle = t * (0.6 + 0.12 * fi) + fi * 1.9;
    vec2 motion = vec2(cos(angle), sin(angle * 0.7 + fi * 1.3)) * (0.10 * s);

    // Blob position in screen uv
    vec2 pos = base + motion;

    // Adjust for aspect so blobs stay round
    vec2 d = vec2((scu.x - pos.x) , (scu.y - pos.y));
    d.x *= 1.0; // already accounted by scu.x

    float radius = mix(0.20, 0.06, clamp((s - 0.3) / 1.7, 0.0, 1.0));
    radius *= (1.0 + 0.15 * sin(t * 0.3 + fi * 2.7)); // gentle breathing

    // Gaussian contribution (smoothly blends and merges)
    float contrib = exp(- (d.x * d.x + d.y * d.y) / max(0.0001, radius * radius));
    field += contrib;
  }

  // Normalize field to a useful range and apply softness
  float fieldScaled = field * (0.6 + soft * 2.0);
  float m = clamp(fieldScaled, 0.0, 1.0);

  // Palette: three-way blend tuned for saturated lava-lamp look
  vec3 colAB = mix(colorA.rgb, colorB.rgb, smoothstep(0.0, 0.6, m));
  vec3 col = mix(colAB, colorC.rgb, smoothstep(0.3, 0.95, m));

  // Add outer glow rim for stronger contrast
  float rim = smoothstep(0.02, 0.0, length(vec2(scu.x - 0.5, scu.y - 0.5))) * 0.15;
  col += rim * (0.6 * (1.0 - m));

  // Punchier output for night-time displays
  col = pow(col, vec3(0.9)); // slight contrast boost

  gl_FragColor = vec4(col, 1.0);
}
