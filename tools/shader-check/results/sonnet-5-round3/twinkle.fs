/*{
  "DESCRIPTION": "Twinkling stars sparkle across the display in shifting colours",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.85, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 8.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = isf_FragNormCoord;

  // On tall/short displays, keep the star field two-dimensional in feel,
  // but if it's a 1-pixel-tall roofline, spread cells along x only.
  vec2 cellCoord;
  if (RENDERSIZE.y < 2.0) {
    cellCoord = vec2(uv.x * density * 2.0, 0.0);
  } else {
    cellCoord = uv * vec2(density, density * (RENDERSIZE.y / max(RENDERSIZE.x, 1.0)) * 2.0 + 1.0);
  }

  vec2 cell = floor(cellCoord);

  float starSeed = hash(cell);

  // Only some cells host a star
  float present = step(0.55, starSeed);

  // Each star twinkles on its own phase and rate
  float phase = hash(cell + 7.7) * 6.2831853;
  float rate = 0.6 + hash(cell + 3.3) * 1.4;
  float twinkle = 0.5 + 0.5 * sin(TIME * speed * rate + phase);

  // Sharpen the twinkle so stars mostly sit dim/off with bright flashes
  float bright = pow(twinkle, mix(1.0, 8.0, sharpness));

  float starVal = present * bright;

  // Colour drifts per-star between colorA and colorB
  float colorMix = hash(cell + 1.1);
  vec3 starColor = mix(colorA.rgb, colorB.rgb, colorMix);

  vec3 col = starColor * starVal;

  gl_FragColor = vec4(col, 1.0);
}
