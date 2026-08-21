/*{
  "DESCRIPTION": "A waving American-style flag of red, white and blue stripes with a blue canton",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.8, 0.0, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.1, 0.5, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "waveAmount", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isRoofline = RENDERSIZE.y < 2.0;

  // wave phase travels along x, displaces the "other" axis to fake cloth motion
  float t = TIME * speed;

  if (isRoofline) {
    // single line of lights: fold the flag into x alone.
    // sweep through stripes left to right, with a horizontal ripple to read as waving.
    float wave = sin(uv.x * 10.0 + t * 2.0) * waveAmount * 0.05;
    float pos = fract(uv.x + wave);

    // first ~35% of the strip is the canton (blue), rest is stripes
    if (pos < 0.35) {
      gl_FragColor = vec4(colorC.rgb, 1.0);
    } else {
      float stripePos = (pos - 0.35) / 0.65;
      float stripeIndex = floor(stripePos * 7.0);
      float band = mod(stripeIndex, 2.0);
      vec3 col = mix(colorA.rgb, colorB.rgb, band);
      gl_FragColor = vec4(col, 1.0);
    }
    return;
  }

  // full 2D flag
  float wave = sin(uv.x * 6.0 + t * 2.0) * waveAmount * 0.06;
  float wave2 = sin(uv.x * 3.0 + t * 1.3) * waveAmount * 0.03;
  float y = uv.y + wave + wave2;

  float cantonWidth = 0.4;
  float cantonHeight = 0.55;

  vec3 col;

  if (uv.x < cantonWidth && y > (1.0 - cantonHeight)) {
    // canton: blue field, simple star sparkle grid
    vec2 starUV = vec2(uv.x / cantonWidth, (y - (1.0 - cantonHeight)) / cantonHeight);
    vec2 grid = fract(starUV * vec2(6.0, 5.0)) - 0.5;
    float d = length(grid);
    float star = smoothstep(0.14, 0.06, d);
    col = mix(colorC.rgb, colorB.rgb, star * 0.9);
  } else {
    // stripes: 13 stripes across full height
    float stripeIndex = floor(y * 13.0);
    float band = mod(stripeIndex, 2.0);
    col = mix(colorA.rgb, colorB.rgb, band);
  }

  gl_FragColor = vec4(col, 1.0);
}
