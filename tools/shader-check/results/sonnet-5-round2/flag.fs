/*{
  "DESCRIPTION": "A waving American-style flag of stripes and stars in red white and blue",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.7, 0.05, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.05, 0.1, 0.5, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "waveAmount", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool tall = RENDERSIZE.y >= 2.0;

  // pick the axis that runs "across the flag length" so waving always reads
  vec2 p = tall ? uv : uv.yx;

  float t = TIME * speed;

  // waving distortion: ripples travel along x, displace y
  float wave = sin(p.x * 8.0 + t * 2.5) * 0.03 * waveAmount
             + sin(p.x * 3.0 + t * 1.3) * 0.02 * waveAmount;
  float py = p.y + wave;
  float px = p.x + wave * 0.5;

  // canton (blue star field) occupies top-left ~0.55 x 0.5
  bool inCanton = px < 0.55 && py > 0.5;

  vec3 col;

  if (inCanton) {
    // simple star grid using distance to nearest grid point
    vec2 cuv = vec2(px / 0.55, (py - 0.5) / 0.5);
    vec2 grid = vec2(6.0, 5.0);
    vec2 cell = fract(cuv * grid) - 0.5;
    float d = length(cell);
    float star = step(d, 0.18);
    col = mix(colorC.rgb, colorB.rgb, star);
  } else {
    // 7 stripes, alternating red/white, offset by wave
    float stripeIndex = floor(py * 7.0);
    float stripeFrac = mod(stripeIndex, 2.0);
    col = mix(colorA.rgb, colorB.rgb, stripeFrac);
  }

  // subtle shading from wave to sell the fabric motion
  float shade = 0.9 + 0.1 * sin(p.x * 8.0 + t * 2.5);
  col *= shade;

  gl_FragColor = vec4(col, 1.0);
}
