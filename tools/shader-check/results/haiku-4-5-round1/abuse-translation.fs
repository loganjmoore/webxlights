/*{
  "DESCRIPTION": "Merry Christmas in ten languages scrolls across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorText", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorBg", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float scroll = mod(TIME * speed * 0.3, 10.0);
  float pos = uv.x + scroll;
  
  float band = smoothstep(0.05, 0.15, mod(pos, 1.0)) * smoothstep(0.85, 0.95, mod(pos, 1.0));
  band *= smoothstep(0.2, 0.4, uv.y) * smoothstep(0.8, 0.6, uv.y);
  
  vec3 color = mix(colorBg.rgb, colorText.rgb, band);
  gl_FragColor = vec4(color, 1.0);
}
