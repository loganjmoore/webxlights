/*{
  "DESCRIPTION": "Festive color waves sweeping across the display with alternating hues",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 10.0, "DEFAULT": 3.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  float wave = sin((uv.x * scale - TIME * speed) * 6.28318) * 0.5 + 0.5;
  vec3 color = mix(colorA.rgb, colorB.rgb, wave);
  gl_FragColor = vec4(color, 1.0);
}
