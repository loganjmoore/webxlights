/*{
  "DESCRIPTION": "Swirling plasma effect with animated color vortex",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.5, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord - 0.5;
  
  float angle = atan(uv.y, uv.x);
  float radius = length(uv);
  
  float plasma = sin(angle * 3.0 + TIME * speed) * 0.5 + 0.5;
  plasma += sin(radius * scale - TIME * speed * 0.7) * 0.5 + 0.5;
  plasma += sin((angle + radius) * 2.0 + TIME * speed * 0.5) * 0.5 + 0.5;
  
  plasma = mod(plasma, 3.0) / 3.0;
  
  vec3 color;
  if (plasma < 0.5) {
    color = mix(colorA.rgb, colorB.rgb, plasma * 2.0);
  } else {
    color = mix(colorB.rgb, colorC.rgb, (plasma - 0.5) * 2.0);
  }
  
  gl_FragColor = vec4(color, 1.0);
}
