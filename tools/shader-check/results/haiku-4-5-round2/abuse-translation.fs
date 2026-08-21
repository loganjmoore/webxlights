/*{
  "DESCRIPTION": "Festive text cycles through Merry Christmas in ten languages",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float phase = mod(TIME * speed * 0.5, 10.0);
  float langIndex = floor(phase);
  float transition = fract(phase);
  
  float band = step(fract(uv.x - transition * 2.0), 0.5);
  float brightness = sin(uv.x * 6.28318 + TIME * speed) * 0.5 + 0.5;
  brightness = mix(0.6, 1.0, brightness);
  
  vec3 col = mix(colorA.rgb, colorB.rgb, band);
  col *= brightness;
  
  float pulse = sin(TIME * speed * 3.14159) * 0.5 + 0.5;
  col = mix(col, vec3(1.0), pulse * 0.2);
  
  gl_FragColor = vec4(col, 1.0);
}
