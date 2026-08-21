/*{
  "DESCRIPTION": "Flowing aurora borealis curtains of colour drifting across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.4, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.4, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.6, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "bands", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float t = TIME * speed * 0.3;

  bool vertical = RENDERSIZE.y < 2.0;
  float along = vertical ? uv.x : uv.x;
  float across = vertical ? 0.5 : uv.y;

  float wave1 = sin(along * bands * 6.283185 + t * 2.0) * 0.25;
  float wave2 = sin(along * bands * 3.0 + t * 1.3 + 1.7) * 0.15;
  float flow = wave1 + wave2;

  float band = across + flow * 0.5 + 0.5 * sin(t * 0.5);
  band = fract(band);

  float m1 = smoothstep(0.0, 0.5, band) * (1.0 - smoothstep(0.4, 1.0, band));
  vec3 col = mix(colorA.rgb, colorB.rgb, smoothstep(0.0, 0.6, band));
  col = mix(col, colorC.rgb, smoothstep(0.5, 1.0, band));

  float shimmer = 0.75 + 0.25 * sin(along * 20.0 + t * 4.0);
  float glow = 0.4 + 0.6 * m1 * shimmer;

  col *= glow;
  col = max(col, colorA.rgb * 0.05);

  gl_FragColor = vec4(col, 1.0);
}
