/*{
  "DESCRIPTION": "Swirling plasma effect with animated color cycling",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord * scale;
  
  float angle = atan(uv.y - 0.5, uv.x - 0.5);
  float dist = length(uv - 0.5);
  
  float wave1 = sin(angle * 3.0 + TIME * speed - dist * 4.0) * 0.5 + 0.5;
  float wave2 = cos(angle * 2.0 - TIME * speed * 0.7 + dist * 3.0) * 0.5 + 0.5;
  float wave3 = sin(dist * 6.0 - TIME * speed * 1.3 + angle) * 0.5 + 0.5;
  
  float plasma = (wave1 + wave2 + wave3) / 3.0;
  
  vec3 color = mix(colorA.rgb, colorB.rgb, wave1);
  color = mix(color, colorC.rgb, wave2);
  
  gl_FragColor = vec4(color * (0.7 + plasma * 0.3), 1.0);
}
