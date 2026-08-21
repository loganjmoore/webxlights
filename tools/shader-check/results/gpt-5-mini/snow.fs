/*{
  "DESCRIPTION": "Gentle falling snow for Christmas lights",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "bgColor", "TYPE": "color", "DEFAULT": [0.02, 0.05, 0.20, 1.0] },
    { "NAME": "snowColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 0.40 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.1, "MAX": 8.0, "DEFAULT": 2.00 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.5, "MAX": 10.0, "DEFAULT": 3.00 },
    { "NAME": "twinkle", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.25 }
  ]
}*/
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = (RENDERSIZE.y < 2.0);
  // For rooflines, drive the same animation along the horizontal axis
  if (isLine) {
    uv.y = isf_FragNormCoord.x;
  }

  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // parameters tuned for small canvases
  const int COLS = 8;
  const int ROWS = 4;

  // grid scale increases with density to produce more flakes visually
  float gridScaleMul = 1.0 + density * 0.60;
  vec2 baseGrid = vec2(float(COLS), float(ROWS));
  float t = TIME * max(speed, 0.0);

  float accum = 0.0;

  for (int xi = 0; xi < COLS; xi++) {
    for (int yi = 0; yi < ROWS; yi++) {
      vec2 idx = vec2(float(xi), float(yi));

      // pseudo-random offsets per cell
      float rx = hash21(idx + vec2(0.13, 0.37));
      float ry = hash21(idx + vec2(0.71, 0.29));

      // base position in 0..1, repeat more when density is higher
      vec2 basePos = fract((idx + vec2(rx, ry)) / baseGrid * gridScaleMul);

      // falling motion: wrap y with time. Speed slightly varies by cell.
      float fallSpeed = 0.03 + rx * 0.07;
      float yPos = fract(basePos.y + t * fallSpeed);

      // horizontal subtle drift
      float drift = sin(t * (0.2 + ry * 0.8) + rx * 6.283185) * (0.02 + ry * 0.03);
      float xPos = basePos.x + drift;

      vec2 pos = vec2(xPos, yPos);
      pos = fract(pos); // wrap into 0..1

      // size varies per flake, influenced by scale and density
      float sizeBase = mix(0.012, 0.035, ry);
      float size = sizeBase * (1.0 / max(scale, 0.001)) * (1.0 + density * 0.12);

      // compute distance: for line displays, use 1D distance
      float dist;
      if (isLine) {
        dist = abs(uv.x - pos.x);
      } else {
        vec2 d = (uv - pos) * vec2(aspect, 1.0);
        dist = length(d);
      }

      // soft circular flake with smooth edge
      float flake = 1.0 - smoothstep(0.0, size, dist);

      // twinkle per flake
      float tw = 0.8 + 0.2 * sin(t * (1.0 + rx * 3.0) * (1.0 + twinkle * 8.0) + rx * 12.0);
      flake *= mix(1.0, tw, twinkle);

      // weight flakes so larger ones contribute more
      float weight = 0.6 + 0.8 * ry;
      accum += flake * weight * 0.35;
    }
  }

  // soft overall clamp
  accum = clamp(accum, 0.0, 1.0);
  // boost highlights a bit for night visibility
  float glow = pow(accum, 0.65);

  vec3 color = mix(bgColor.rgb, snowColor.rgb, glow);
  gl_FragColor = vec4(color, 1.0);
}
