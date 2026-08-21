/*{
  "DESCRIPTION": "A waving American flag of red white and blue stripes with a blue star field corner",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.8, 0.05, 0.05, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.05, 0.1, 0.6, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "waveAmount", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool thin = RENDERSIZE.y < 2.0;

  // Use px as the coordinate that runs along the flag's long axis (waving direction)
  // and py as the short axis. On a 1-pixel-tall roofline, fake the wave along x.
  float px = thin ? uv.x : uv.x;
  float py = thin ? 0.5 : uv.y;

  float t = TIME * speed;

  // Waving displacement: ripples travel along x, displace the stripe pattern in y
  float wave = sin(px * 10.0 + t * 3.0) * 0.03 * waveAmount
             + sin(px * 4.0 + t * 1.7) * 0.02 * waveAmount;

  float wavedY = py + wave;

  vec3 col;

  if (thin) {
    // Roofline: represent the flag as a horizontal sequence -
    // canton (stars, blue) on the left, stripes waving along the rest via brightness pulses
    float cantonWidth = 0.35;
    if (px < cantonWidth) {
      // star field flicker along x
      float starPulse = step(0.5, fract(px * 14.0 + sin(t * 2.0) * 0.5));
      col = mix(colorC.rgb, colorB.rgb, starPulse * 0.5);
    } else {
      float stripeCoord = (px - cantonWidth) * 13.0 + wave * 8.0;
      float stripeBand = step(0.5, fract(stripeCoord));
      col = mix(colorA.rgb, colorB.rgb, stripeBand);
    }
  } else {
    float cantonWidth = 0.4;
    float cantonHeight = 0.55;

    if (px < cantonWidth && py > (1.0 - cantonHeight) + wave * 0.5) {
      // Star field: small grid of stars on blue
      vec2 starUV = vec2(px / cantonWidth, (py - (1.0 - cantonHeight)) / cantonHeight);
      vec2 grid = fract(starUV * vec2(6.0, 5.0)) - 0.5;
      float starDot = 1.0 - smoothstep(0.08, 0.18, length(grid));
      col = mix(colorC.rgb, colorB.rgb, starDot);
    } else {
      // Stripes: 13 stripes alternating red/white, waved in y
      float stripeIndex = floor(wavedY * 13.0);
      float stripeBand = mod(stripeIndex, 2.0);
      float band = step(0.5, stripeBand);
      col = mix(colorB.rgb, colorA.rgb, band);
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
