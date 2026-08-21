/*{
  "DESCRIPTION": "warm candle flicker in glowing orange and yellow tones",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.4, 0.02, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.2, 1.0] },
    { "NAME": "flickerSpeed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "intensity", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "brightness", "TYPE": "float", "MIN": 0.2, "MAX": 1.5, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float t = TIME * flickerSpeed;

  // layered pseudo-random flicker from stacked sines, cheap and seamless
  float n = sin(t * 7.3) * 0.5
          + sin(t * 13.1 + 1.7) * 0.3
          + sin(t * 22.7 + 4.2) * 0.2;
  n = n * 0.5 + 0.5;

  float flicker = mix(1.0 - intensity, 1.0, n);

  // gentle vertical or horizontal warmth falloff depending on model shape
  float grad;
  if (RENDERSIZE.y < 2.0) {
    grad = 1.0 - abs(uv.x - 0.5) * 0.6;
  } else {
    grad = 1.0 - uv.y * 0.5;
  }

  float glow = clamp(flicker * grad * brightness, 0.0, 1.5);

  vec3 col = mix(colorA.rgb, colorB.rgb, clamp(glow, 0.0, 1.0));
  col *= 0.6 + glow * 0.6;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
