/*{
  "DESCRIPTION": "A sunrise climbing slowly, deep orange at the horizon fading up into brighter sky",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.35, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.3, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.2, 0.5, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // 100 * 0.1 is whole: the sun climbs and resets every ten seconds at speed 1, seamlessly
  // because it rises through the bottom again rather than jumping.
  float phase = fract(mod(TIME * speed, 100.0) * 0.1);
  // The sun: a disc that rises from below the horizon to the upper third and back.
  float sunY = -0.2 + 0.9 * (0.5 - 0.5 * cos(phase * 6.2831853));
  vec2 p = isLine ? vec2(uv.x - 0.5, 0.0) : vec2((uv.x - 0.5) * aspect, uv.y - sunY);
  float sun = isLine ? smoothstep(0.35, 0.05, abs(uv.x - 0.5) / (0.3 + sunY)) : smoothstep(0.22, 0.14, length(p));
  // Sky: three flat bands - horizon glow, gold, then blue - that follow the sun up.
  float y = isLine ? 0.25 + 0.4 * sunY : uv.y;
  float band1 = smoothstep(sunY + 0.05, sunY + 0.2, y);
  float band2 = smoothstep(sunY + 0.35, sunY + 0.5, y);
  vec3 col = mix(colorA.rgb, colorB.rgb, band1);
  col = mix(col, colorC.rgb, band2);
  // Always well lit: even the highest sky is at half, and the horizon glows at full.
  float lit = 0.55 + 0.45 * (1.0 - band2 * 0.6);
  col *= lit;
  col = mix(col, colorB.rgb, sun);
  gl_FragColor = vec4(col, 1.0);
}
