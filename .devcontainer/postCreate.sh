# Prepare python environment
pip install -r requirements.txt
pip install -r requirements.dev.txt

# Prepare node environment
npm install

# Prepare MongoDB Development DB
./.devcontainer/installMongoDB.sh
./.devcontainer/startMongoDB.sh