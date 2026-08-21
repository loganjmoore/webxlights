/*{
  "DESCRIPTION": "Warm candle flame flicker with glowing base and dancing tip",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.6, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.15, 0.0, 1.0] },
    { "NAME": "flicker", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.0 },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;

  // pick the axis that carries the "vertical" flame motion
  float along = isLine ? uv.x : uv.y;

  float t = TIME * speed;

  // layered flicker noise from cheap sines at irrational-ish ratios
  float n = sin(t * 9.0) * 0.5
          + sin(t * 17.3 + 1.7) * 0.3
          + sin(t * 5.1 + 4.2) * 0.2;
  n *= flicker;

  // slow breathing brightness plus fast jitter
  float breathe = 0.85 + 0.15 * sin(t * 1.3);
  float bright = breathe + n * 0.18;
  bright = clamp(bright, 0.35, 1.3);

  // flame shape: hottest/brightest near base (along=0), fading toward tip
  float shape = 1.0 - smoothstep(0.0, 1.0, along);
  shape = pow(shape, 1.4 + 0.4 * sin(t * 3.0));

  // mix from deep orange-red (colorB) at edges/tip to hot warm (colorA) at core
  vec3 col = mix(colorB.rgb, colorA.rgb, shape);
  col *= bright;

  // small extra hot flicker punch near the base
  float base = 1.0 - smoothstep(0.0, 0.4, along);
  col += colorA.rgb * base * max(n, 0.0) * 0.25;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
