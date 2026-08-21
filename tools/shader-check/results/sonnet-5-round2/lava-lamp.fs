/*{
  "DESCRIPTION": "Slow drifting lava lamp blobs that merge and separate",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.6, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.6, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "blobSize", "TYPE": "float", "MIN": 0.5, "MAX": 3.0, "DEFAULT": 1.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isFlat = RENDERSIZE.y < 2.0;

  float t = TIME * speed * 0.15;

  vec2 p = uv * 2.0 - 1.0;
  p.x *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);

  vec2 b1, b2, b3;
  if (isFlat) {
    b1 = vec2(sin(t * 0.9) * 0.7, sin(t * 0.5) * 0.25);
    b2 = vec2(cos(t * 0.7) * 0.7, cos(t * 0.6) * 0.25 + 0.1);
    b3 = vec2(sin(t * 0.5 + 1.5) * 0.7, sin(t * 0.8 + 2.0) * 0.25 - 0.1);
  } else {
    b1 = vec2(sin(t * 0.9) * 0.6, cos(t * 0.7) * 0.6);
    b2 = vec2(cos(t * 0.6 + 2.0) * 0.6, sin(t * 0.8 + 1.0) * 0.6);
    b3 = vec2(sin(t * 0.5 + 4.0) * 0.6, cos(t * 0.9 + 3.0) * 0.6);
  }

  float r = 0.55 / blobSize;

  float d1 = length(p - b1) - r;
  float d2 = length(p - b2) - r;
  float d3 = length(p - b3) - r;

  float k = 0.4;
  float m12 = min(d1, d2) - k * smoothstep(0.0, k, k - abs(d1 - d2));
  float m123 = min(m12, d3) - k * smoothstep(0.0, k, k - abs(m12 - d3));

  float glow1 = smoothstep(r * 0.9, -r * 0.5, d1);
  float glow2 = smoothstep(r * 0.9, -r * 0.5, d2);
  float glow3 = smoothstep(r * 0.9, -r * 0.5, d3);

  vec3 col = mix(colorA.rgb, colorA.rgb * 0.15, smoothstep(-0.15, 0.15, m123));
  col = mix(col, colorA.rgb, glow1 * 0.9);
  col = mix(col, colorB.rgb, glow2 * 0.9);
  col = mix(col, colorC.rgb, glow3 * 0.9);

  gl_FragColor = vec4(col, 1.0);
}
